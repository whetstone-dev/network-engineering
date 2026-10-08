// Normaliza el modelo para el análisis: expande rangos de interfaces, infiere modos y parsea IPs.
// El modelo original no se modifica (los generadores de configuración usan el original para conservar los rangos).

import type { Device, Diagnostic, Iface, IfMode, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { Cidr4 } from './ip.ts'
import { parseCidr4 } from './ip.ts'
import { expandRange, ifKey, normalizeIfName } from './names.ts'

export interface NIface extends Iface {
  name: string
  key: string
  mode: IfMode
  declaredAs: string          // nombre tal como aparece en el modelo (puede ser un rango)
  cidr?: Cidr4
  deviceId: string
  parentKey?: string          // subinterfaz → clave de la interfaz física
}

export interface NDevice extends Omit<Device, 'interfaces'> {
  ifaces: NIface[]
  ifByKey: Map<string, NIface>
  source: Device
}

/** Dispositivos que se comportan como puente L2 transparente (sin VLANs). */
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
  if (dev.type === 'firewall' && ifc.vlan !== undefined && !ifc.ip) return 'access'   // ASA 5505: puerto L2
  if (dev.type === 'l3switch') return ifc.ip ? 'routed' : (ifc.allowedVlans || ifc.nativeVlan ? 'trunk' : 'access')
  return 'routed'
}

export function normalizeModel(model: NetworkModel, diags: Diagnostic[]): Map<string, NDevice> {
  const devices = new Map<string, NDevice>()
  for (const dev of model.devices ?? []) {
    if (!dev || typeof dev.id !== 'string' || !dev.id) {
      diags.push({ severity: 'error', code: 'DEVICE-ID-MISSING', message: 'Hay un dispositivo sin "id".' })
      continue
    }
    if (devices.has(dev.id)) {
      diags.push({ severity: 'error', code: 'DEVICE-ID-DUP', message: `Id de dispositivo duplicado: ${dev.id}.`, subject: { device: dev.id } })
      continue
    }
    const nd: NDevice = { ...dev, ifaces: [], ifByKey: new Map(), source: dev }
    for (const ifc of dev.interfaces ?? []) {
      if (!ifc || typeof ifc.name !== 'string') {
        diags.push({ severity: 'error', code: 'IF-NAME-MISSING', message: `${dev.id} tiene una interfaz sin "name".`, subject: { device: dev.id } })
        continue
      }
      const nombres = expandRange(ifc.name)
      if (nombres.length > 1 && ifc.ip) {
        diags.push({ severity: 'error', code: 'IF-RANGE-WITH-IP', message: `${dev.id}: el rango ${ifc.name} no puede tener una IP única.`, subject: { device: dev.id, interface: ifc.name } })
      }
      for (const crudo of nombres) {
        const nombre = normalizeIfName(crudo)
        const key = ifKey(nombre)
        if (nd.ifByKey.has(key)) {
          diags.push({ severity: 'error', code: 'IF-DUP', message: `${dev.id}: la interfaz ${nombre} está declarada más de una vez.`, subject: { device: dev.id, interface: nombre } })
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
            diags.push({ severity: 'error', code: 'IP-INVALID', message: `${dev.id} ${nombre}: IP inválida "${ifc.ip}" (formato a.b.c.d/nn).`, subject: { device: dev.id, interface: nombre } })
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

/** ¿La interfaz está operativa según el modelo? */
export function ifUp(i: NIface): boolean {
  return !i.shutdown && i.status !== 'down' && i.status !== 'error'
}

/** Busca una interfaz por nombre (acepta abreviaturas). */
export function findIface(dev: NDevice | undefined, nombre: string | undefined): NIface | undefined {
  if (!dev || !nombre) return undefined
  return dev.ifByKey.get(ifKey(nombre))
}
