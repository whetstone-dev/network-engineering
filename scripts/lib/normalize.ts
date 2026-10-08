// Normalizes the model for analysis: expands interface ranges, infers modes and parses IPs.
// The original model is not modified (config generators use the original to preserve ranges).

import type { Device, Diagnostic, Iface, IfMode, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { Cidr4 } from './ip.ts'
import { parseCidr4 } from './ip.ts'
import { expandRange, ifKey, normalizeIfName } from './names.ts'

export interface NIface extends Iface {
  name: string
  key: string
  mode: IfMode
  declaredAs: string          // name as it appears in the model (may be a range)
  cidr?: Cidr4
  deviceId: string
  parentKey?: string          // subinterface → key of the physical interface
}

export interface NDevice extends Omit<Device, 'interfaces'> {
  ifaces: NIface[]
  ifByKey: Map<string, NIface>
  source: Device
}

/** Devices that behave as a transparent L2 bridge (no VLANs). */
export const BRIDGE_TYPES = new Set(['ap', 'hub', 'modem'])

export function inferMode(dev: Device, ifc: Iface, nombre: string): IfMode {
  const k = nombre.toLowerCase()
  if (/^vlan\d+$/.test(k)) return 'svi'
  if (/^loopback\d+$/.test(k)) return 'loopback'
  if (k.includes('.')) return 'subinterface'
  if (ifc.mode) return ifc.mode
  if (HOST_TYPES.has(dev.type)) return 'host'
  if (dev.type === 'switch' || BRIDGE_TYPES.has(dev.type)) return 'access'
  if (dev.type === 'cloud') return ifc.ip ? 'routed' : 'access'
  if (dev.type === 'firewall' && ifc.vlan !== undefined && !ifc.ip) return 'access'   // ASA 5505: L2 port
  if (dev.type === 'l3switch') return ifc.ip ? 'routed' : (ifc.allowedVlans || ifc.nativeVlan ? 'trunk' : 'access')
  return 'routed'
}

export function normalizeModel(model: NetworkModel, diags: Diagnostic[]): Map<string, NDevice> {
  const devices = new Map<string, NDevice>()
  for (const dev of model.devices ?? []) {
    if (!dev || typeof dev.id !== 'string' || !dev.id) {
      diags.push({ severity: 'error', code: 'DEVICE-ID-MISSING', message: 'A device has no "id".' })
      continue
    }
    if (devices.has(dev.id)) {
      diags.push({ severity: 'error', code: 'DEVICE-ID-DUP', message: `Duplicate device id: ${dev.id}.`, subject: { device: dev.id } })
      continue
    }
    const nd: NDevice = { ...dev, ifaces: [], ifByKey: new Map(), source: dev }
    for (const ifc of dev.interfaces ?? []) {
      if (!ifc || typeof ifc.name !== 'string') {
        diags.push({ severity: 'error', code: 'IF-NAME-MISSING', message: `${dev.id} has an interface without "name".`, subject: { device: dev.id } })
        continue
      }
      const nombres = expandRange(ifc.name)
      if (nombres.length > 1 && ifc.ip) {
        diags.push({ severity: 'error', code: 'IF-RANGE-WITH-IP', message: `${dev.id}: range ${ifc.name} cannot have a single IP.`, subject: { device: dev.id, interface: ifc.name } })
      }
      for (const crudo of nombres) {
        const nombre = normalizeIfName(crudo)
        const key = ifKey(nombre)
        if (nd.ifByKey.has(key)) {
          diags.push({ severity: 'error', code: 'IF-DUP', message: `${dev.id}: interface ${nombre} is declared more than once.`, subject: { device: dev.id, interface: nombre } })
          continue
        }
        const mode = inferMode(dev, ifc, nombre)
        const n: NIface = { ...ifc, name: nombre, key, mode, declaredAs: ifc.name, deviceId: dev.id }
        if (mode === 'svi' && n.vlan === undefined) n.vlan = Number(nombre.match(/\d+$/)![0])
        if (mode === 'subinterface') {
          n.parentKey = key.split('.')[0]
          if (n.vlan === undefined) n.vlan = Number(key.split('.')[1])
        }
        if (mode === 'access' && n.vlan === undefined) n.vlan = 1
        if (ifc.ip) {
          const c = parseCidr4(ifc.ip)
          if (!c) {
            diags.push({ severity: 'error', code: 'IP-INVALID', message: `${dev.id} ${nombre}: invalid IP "${ifc.ip}" (format a.b.c.d/nn).`, subject: { device: dev.id, interface: nombre } })
          } else {
            n.cidr = c
          }
        }
        nd.ifaces.push(n)
        nd.ifByKey.set(key, n)
      }
    }
    devices.set(dev.id, nd)
  }
  return devices
}

/** Is the interface operational according to the model? */
export function ifUp(i: NIface): boolean {
  return !i.shutdown && i.status !== 'down' && i.status !== 'error'
}

/** Finds an interface by name (abbreviations accepted). */
export function findIface(dev: NDevice | undefined, nombre: string | undefined): NIface | undefined {
  if (!dev || !nombre) return undefined
  return dev.ifByKey.get(ifKey(nombre))
}
