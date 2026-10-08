// Layer 2: link resolution, port behavior (access/trunk/subinterfaces),
// broadcast domains (segments) and switching consistency rules.

import type { Diagnostic, Link, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { NDevice, NIface } from './normalize.ts'
import { BRIDGE_TYPES, findIface, ifUp } from './normalize.ts'
import { splitEndpoint } from './names.ts'

export interface Endpoint { dev: NDevice; iface: NIface }

export interface ResolvedLink {
  index: number
  id: string
  link: Link
  a: Endpoint
  b: Endpoint
  kind: 'trunk' | 'access' | 'routed' | 'mixed' | 'other'
  vlans: number[]
}

export interface Segment {
  id: string
  ifaces: NIface[]            // L3 interfaces (router, SVI, host...) inside the domain
  vlans: number[]             // VLANs that form this broadcast domain
  devices: string[]           // switches/bridges traversed
}

interface PortBehavior { untagged?: string; tagged: Map<number, string> }

// ---------- union-find ----------
class UnionFind {
  private padre = new Map<string, string>()
  find(x: string): string {
    if (!this.padre.has(x)) this.padre.set(x, x)
    let r = x
    while (this.padre.get(r) !== r) r = this.padre.get(r)!
    let c = x
    while (this.padre.get(c) !== r) { const n = this.padre.get(c)!; this.padre.set(c, r); c = n }
    return r
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.padre.set(ra, rb)
  }
  keys(): string[] { return [...this.padre.keys()] }
}

const nodoL3 = (i: NIface): string => `I|${i.deviceId}|${i.key}`
const nodoBridge = (dev: string, vlan: number): string => `B|${dev}|${vlan}`

export function isSwitchLike(dev: NDevice): boolean {
  if (dev.type === 'firewall') return dev.ifaces.some((i) => i.mode === 'access' || i.mode === 'trunk')   // ASA 5505
  return dev.type === 'switch' || dev.type === 'l3switch' || BRIDGE_TYPES.has(dev.type) || (dev.type === 'cloud')
}

export function isL3Iface(i: NIface): boolean {
  return i.mode === 'routed' || i.mode === 'host' || i.mode === 'svi' || i.mode === 'subinterface' || i.mode === 'loopback'
}

/** VLANs known in the model (declared or referenced); always includes VLAN 1. */
export function knownVlans(model: NetworkModel, devices: Map<string, NDevice>): number[] {
  const s = new Set<number>([1])
  for (const v of model.vlans ?? []) s.add(v.id)
  for (const d of devices.values()) {
    for (const v of d.vlans ?? []) s.add(v)
    for (const i of d.ifaces) {
      if (i.vlan !== undefined) s.add(i.vlan)
      if (i.nativeVlan !== undefined) s.add(i.nativeVlan)
      if (Array.isArray(i.allowedVlans)) i.allowedVlans.forEach((v) => s.add(v))
    }
  }
  return [...s].sort((a, b) => a - b)
}

/** Effective configuration of a port (EtherChannel members inherit from the Port-channel). */
export function effectivePort(dev: NDevice, i: NIface): NIface {
  if (!i.channelGroup) return i
  const po = dev.ifByKey.get(`port-channel${i.channelGroup.id}`)
  return po ? { ...po, shutdown: i.shutdown, status: i.status } : i
}

export function trunkAllowed(i: NIface, vlans: number[]): number[] {
  return Array.isArray(i.allowedVlans) ? i.allowedVlans : vlans
}

function portBehavior(dev: NDevice, i: NIface, vlans: number[]): PortBehavior | null {
  if (!ifUp(i)) return null
  const tagged = new Map<number, string>()
  if (isSwitchLike(dev) && (i.mode === 'access' || i.mode === 'trunk')) {
    const e = effectivePort(dev, i)
    if (BRIDGE_TYPES.has(dev.type) || dev.type === 'cloud') return { untagged: nodoBridge(dev.id, 1), tagged }
    if (e.mode === 'access') return { untagged: nodoBridge(dev.id, e.vlan ?? 1), tagged }
    const nativa = e.nativeVlan ?? 1
    const permitidas = trunkAllowed(e, vlans)
    for (const v of permitidas) if (v !== nativa) tagged.set(v, nodoBridge(dev.id, v))
    return { untagged: permitidas.includes(nativa) ? nodoBridge(dev.id, nativa) : undefined, tagged }
  }
  if (i.mode === 'host') return { untagged: nodoL3(i), tagged }
  if (i.mode === 'routed') {
    const subs = dev.ifaces.filter((s) => s.parentKey === i.key && ifUp(s))
    let untagged: string | undefined = i.cidr || i.dhcp || subs.length === 0 ? nodoL3(i) : undefined
    for (const s of subs) {
      if (s.native) { if (!untagged) untagged = nodoL3(s) } else if (s.vlan !== undefined) tagged.set(s.vlan, nodoL3(s))
    }
    return { untagged, tagged }
  }
  return null
}

/** Set of VLANs "configured" on a port (null = inherited from the other end, e.g. a host). */
function portVlans(dev: NDevice, i: NIface, vlans: number[]): number[] | null {
  if (isSwitchLike(dev) && !BRIDGE_TYPES.has(dev.type) && dev.type !== 'cloud') {
    const e = effectivePort(dev, i)
    if (e.mode === 'access') return [e.vlan ?? 1]
    if (e.mode === 'trunk') return trunkAllowed(e, vlans)
  }
  if (i.mode === 'routed') {
    const subs = dev.ifaces.filter((s) => s.parentKey === i.key && s.vlan !== undefined)
    if (subs.length) return subs.map((s) => s.vlan!)
  }
  return null
}

export function resolveLinks(model: NetworkModel, devices: Map<string, NDevice>, diags: Diagnostic[]): ResolvedLink[] {
  const usados = new Map<string, string>()
  const resultado: ResolvedLink[] = []
  const vlans = knownVlans(model, devices)
  ;(model.links ?? []).forEach((link, index) => {
    const id = link.id ?? `L${index + 1}`
    const ends: (Endpoint | null)[] = [link.a, link.b].map((ref) => {
      if (typeof ref !== 'string') {
        diags.push({ severity: 'error', code: 'LINK-ENDPOINT-INVALID', message: `Link ${id}: invalid endpoint.`, subject: { link: id } })
        return null
      }
      const { device, iface } = splitEndpoint(ref)
      const dev = devices.get(device)
      if (!dev) {
        diags.push({ severity: 'error', code: 'LINK-DEVICE-NOT-FOUND', message: `Link ${id}: device "${device}" does not exist.`, subject: { link: id } })
        return null
      }
      let ifc: NIface | undefined
      if (iface) {
        ifc = findIface(dev, iface)
        if (!ifc) {
          diags.push({ severity: 'error', code: 'LINK-IF-NOT-FOUND', message: `Link ${id}: ${device} has no declared interface "${iface}".`, subject: { link: id, device }, hint: 'Declare it in devices[].interfaces.' })
          return null
        }
      } else {
        const fisicas = dev.ifaces.filter((x) => !['svi', 'loopback', 'subinterface'].includes(x.mode))
        if (fisicas.length !== 1) {
          diags.push({ severity: 'error', code: 'LINK-IF-AMBIGUOUS', message: `Link ${id}: specify the interface of ${device} ("${device}:<interface>").`, subject: { link: id, device } })
          return null
        }
        ifc = fisicas[0]
      }
      if (['svi', 'loopback', 'subinterface'].includes(ifc.mode)) {
        diags.push({ severity: 'error', code: 'LINK-LOGICAL-IF', message: `Link ${id}: ${device} ${ifc.name} is logical (${ifc.mode}); a cable connects to a physical interface.`, subject: { link: id, device, interface: ifc.name } })
        return null
      }
      const k = `${device}|${ifc.key}`
      if (usados.has(k)) {
        diags.push({ severity: 'error', code: 'LINK-IF-REUSED', message: `${device} ${ifc.name} is in two links (${usados.get(k)} and ${id}).`, subject: { link: id, device, interface: ifc.name } })
      }
      usados.set(k, id)
      return { dev, iface: ifc }
    })
    const [a, b] = ends
    if (!a || !b) return
    if (a.dev.id === b.dev.id) {
      diags.push({ severity: 'warning', code: 'LINK-SELF', message: `Link ${id} connects ${a.dev.id} to itself.`, subject: { link: id } })
    }
    const va = portVlans(a.dev, a.iface, vlans)
    const vb = portVlans(b.dev, b.iface, vlans)
    const enlaceVlans = va && vb ? va.filter((v) => vb.includes(v)) : (va ?? vb ?? [])
    const modoDe = (e: Endpoint): string => (isSwitchLike(e.dev) ? effectivePort(e.dev, e.iface).mode : e.iface.mode)
    const ma = modoDe(a)
    const mb = modoDe(b)
    const subsA = a.dev.ifaces.some((s) => s.parentKey === a.iface.key)
    const subsB = b.dev.ifaces.some((s) => s.parentKey === b.iface.key)
    let kind: ResolvedLink['kind'] = 'other'
    if ((ma === 'trunk' || subsA) && (mb === 'trunk' || subsB)) kind = 'trunk'
    else if (ma === 'trunk' || mb === 'trunk') kind = 'mixed'
    else if (ma === 'access' || mb === 'access') kind = 'access'
    else if (ma === 'routed' && mb === 'routed') kind = 'routed'
    resultado.push({ index, id, link, a, b, kind, vlans: enlaceVlans })
  })
  return resultado
}

export interface L2Result { segments: Segment[]; segmentOf: Map<string, Segment>; vlanDevices: Map<number, Set<string>> }

/** Computes broadcast domains by joining ports per VLAN across links. */
export function computeSegments(model: NetworkModel, devices: Map<string, NDevice>, links: ResolvedLink[]): L2Result {
  const uf = new UnionFind()
  const vlans = knownVlans(model, devices)
  for (const d of devices.values()) {
    for (const i of d.ifaces) {
      if (isL3Iface(i)) uf.find(nodoL3(i))
      if (i.mode === 'svi' && ifUp(i) && i.vlan !== undefined) uf.union(nodoL3(i), nodoBridge(d.id, i.vlan))
    }
  }
  for (const l of links) {
    if (l.link.status === 'down') continue
    const pa = portBehavior(l.a.dev, l.a.iface, vlans)
    const pb = portBehavior(l.b.dev, l.b.iface, vlans)
    if (!pa || !pb) continue
    if (pa.untagged && pb.untagged) uf.union(pa.untagged, pb.untagged)
    for (const [v, nodo] of pa.tagged) {
      const otro = pb.tagged.get(v)
      if (otro) uf.union(nodo, otro)
    }
  }
  const porRaiz = new Map<string, Segment>()
  const segmentOf = new Map<string, Segment>()
  for (const d of devices.values()) {
    for (const i of d.ifaces) {
      if (!isL3Iface(i)) continue
      const r = uf.find(nodoL3(i))
      let seg = porRaiz.get(r)
      if (!seg) { seg = { id: `S${porRaiz.size + 1}`, ifaces: [], vlans: [], devices: [] }; porRaiz.set(r, seg) }
      seg.ifaces.push(i)
      segmentOf.set(`${d.id}|${i.key}`, seg)
    }
  }
  const vlanDevices = new Map<number, Set<string>>()
  for (const k of uf.keys()) {
    if (!k.startsWith('B|')) continue
    const [, dev, v] = k.split('|')
    const seg = porRaiz.get(uf.find(k))
    if (seg) {
      if (!seg.vlans.includes(Number(v))) seg.vlans.push(Number(v))
      if (!seg.devices.includes(dev)) seg.devices.push(dev)
    }
  }
  for (const l of links) {
    for (const v of l.vlans) {
      if (!vlanDevices.has(v)) vlanDevices.set(v, new Set())
      vlanDevices.get(v)!.add(l.a.dev.id).add(l.b.dev.id)
    }
  }
  for (const d of devices.values()) {
    for (const i of d.ifaces) {
      if ((i.mode === 'svi' || i.mode === 'subinterface') && i.vlan !== undefined) {
        if (!vlanDevices.has(i.vlan)) vlanDevices.set(i.vlan, new Set())
        vlanDevices.get(i.vlan)!.add(d.id)
      }
    }
  }
  return { segments: [...porRaiz.values()], segmentOf, vlanDevices }
}

const CANAL_OK = new Set(['active|active', 'active|passive', 'passive|active', 'desirable|desirable', 'desirable|auto', 'auto|desirable', 'on|on'])

/** Switching consistency rules for each link. */
export function checkL2(model: NetworkModel, devices: Map<string, NDevice>, links: ResolvedLink[], diags: Diagnostic[]): void {
  const vlans = knownVlans(model, devices)
  const declaradas = new Set((model.vlans ?? []).map((v) => v.id))
  for (const l of links) {
    const sujeto = { link: l.id }
    const desc = `${l.a.dev.id} ${l.a.iface.name} ↔ ${l.b.dev.id} ${l.b.iface.name}`
    const ea = isSwitchLike(l.a.dev) ? effectivePort(l.a.dev, l.a.iface) : l.a.iface
    const eb = isSwitchLike(l.b.dev) ? effectivePort(l.b.dev, l.b.iface) : l.b.iface
    const swA = isSwitchLike(l.a.dev) && !BRIDGE_TYPES.has(l.a.dev.type) && l.a.dev.type !== 'cloud'
    const swB = isSwitchLike(l.b.dev) && !BRIDGE_TYPES.has(l.b.dev.type) && l.b.dev.type !== 'cloud'
    const l2A = swA && (ea.mode === 'access' || ea.mode === 'trunk')
    const l2B = swB && (eb.mode === 'access' || eb.mode === 'trunk')

    if (l2A && l2B) {
      if (ea.mode !== eb.mode) {
        diags.push({ severity: 'error', code: 'TRUNK-MODE-MISMATCH', message: `${desc}: one end is trunk and the other is access.`, subject: sujeto, hint: 'Configure "switchport mode trunk" on both ends between switches.' })
      } else if (ea.mode === 'trunk') {
        const na = ea.nativeVlan ?? 1
        const nb = eb.nativeVlan ?? 1
        if (na !== nb) {
          diags.push({ severity: 'error', code: 'NATIVE-VLAN-MISMATCH', message: `${desc}: native VLAN mismatch (${na} vs ${nb}). CDP reports "Native VLAN mismatch" and both VLANs are merged.`, subject: sujeto })
        }
        const pa = trunkAllowed(ea, vlans)
        const pb = trunkAllowed(eb, vlans)
        const soloA = pa.filter((v) => !pb.includes(v))
        const soloB = pb.filter((v) => !pa.includes(v))
        if (soloA.length || soloB.length) {
          diags.push({ severity: 'warning', code: 'ALLOWED-VLAN-MISMATCH', message: `${desc}: allowed VLANs differ (only on ${l.a.dev.id}: ${soloA.join(',') || '-'}; only on ${l.b.dev.id}: ${soloB.join(',') || '-'}). Those VLANs do not cross the link.`, subject: sujeto })
        }
      } else if ((ea.vlan ?? 1) !== (eb.vlan ?? 1)) {
        diags.push({ severity: 'warning', code: 'ACCESS-VLAN-MISMATCH', message: `${desc}: access link with a different VLAN on each end (${ea.vlan ?? 1} vs ${eb.vlan ?? 1}); the VLANs are merged.`, subject: sujeto })
      }
      if (ea.portfast || eb.portfast) {
        diags.push({ severity: 'warning', code: 'PORTFAST-INTERSWITCH', message: `${desc}: PortFast on an inter-switch link can create temporary loops.`, subject: sujeto })
      }
    }

    // Router-on-a-stick and hosts connected to switches
    for (const [sw, swE, otro] of [[l.a, ea, l.b], [l.b, eb, l.a]] as const) {
      const esSwitch = isSwitchLike(sw.dev) && !BRIDGE_TYPES.has(sw.dev.type) && sw.dev.type !== 'cloud'
      if (!esSwitch || !(swE.mode === 'access' || swE.mode === 'trunk')) continue
      const subs = otro.dev.ifaces.filter((s) => s.parentKey === otro.iface.key)
      if (subs.length && otro.iface.mode === 'routed') {
        if (swE.mode === 'access') {
          diags.push({ severity: 'error', code: 'ROAS-ACCESS-PORT', message: `${sw.dev.id} ${sw.iface.name} is access but ${otro.dev.id} ${otro.iface.name} uses subinterfaces (router-on-a-stick).`, subject: sujeto, hint: 'The switch port facing the router must be "switchport mode trunk".' })
        } else {
          const permitidas = trunkAllowed(swE, vlans)
          const nativa = swE.nativeVlan ?? 1
          for (const s of subs) {
            if (s.vlan === undefined) continue
            if (!permitidas.includes(s.vlan)) {
              diags.push({ severity: 'error', code: 'ROAS-VLAN-NOT-ALLOWED', message: `VLAN ${s.vlan} (${otro.dev.id} ${s.name}) is not allowed on trunk ${sw.dev.id} ${sw.iface.name}.`, subject: { ...sujeto, vlan: s.vlan } })
            }
            if (s.native && s.vlan !== nativa) {
              diags.push({ severity: 'error', code: 'ROAS-NATIVE-MISMATCH', message: `${otro.dev.id} ${s.name} is native (VLAN ${s.vlan}) but the native VLAN of trunk ${sw.dev.id} ${sw.iface.name} is ${nativa}.`, subject: sujeto })
            }
            if (nativa !== 1 && !subs.some((x) => x.native) && s === subs[0]) {
              diags.push({ severity: 'info', code: 'ROAS-NATIVE-UNMATCHED', message: `Trunk ${sw.dev.id} ${sw.iface.name} uses native VLAN ${nativa} and ${otro.dev.id} has no native subinterface; it works if that VLAN has no hosts, but CDP may report "Native VLAN mismatch".`, subject: sujeto, hint: `Optional: subinterface ${otro.iface.name}.${nativa} with "encapsulation dot1Q ${nativa} native" and no IP.` })
            }
            if (!s.native && s.vlan === nativa && nativa !== 1) {
              diags.push({ severity: 'warning', code: 'ROAS-NATIVE-TAGGED', message: `${otro.dev.id} ${s.name} tags VLAN ${s.vlan}, which is the native VLAN of the trunk; use "encapsulation dot1Q ${s.vlan} native".`, subject: sujeto })
            }
          }
        }
      }
      if (HOST_TYPES.has(otro.dev.type) && swE.mode === 'trunk') {
        diags.push({ severity: 'warning', code: 'HOST-ON-TRUNK', message: `${otro.dev.id} is connected to a trunk port (${sw.dev.id} ${sw.iface.name}); it will end up in the native VLAN.`, subject: sujeto })
      }
    }

    // EtherChannel
    const ca = l.a.iface.channelGroup
    const cb = l.b.iface.channelGroup
    if (ca && cb && !CANAL_OK.has(`${ca.mode}|${cb.mode}`)) {
      diags.push({ severity: 'error', code: 'ETHERCHANNEL-MODE', message: `${desc}: incompatible EtherChannel modes (${ca.mode}/${cb.mode}); the channel does not form.`, subject: sujeto, hint: 'LACP: active/active or active/passive. PAgP: desirable/desirable or desirable/auto. Static: on/on.' })
    } else if ((ca && !cb) || (!ca && cb)) {
      diags.push({ severity: 'warning', code: 'ETHERCHANNEL-ONE-SIDED', message: `${desc}: only one end belongs to an EtherChannel.`, subject: sujeto })
    }

    // Physical medium (Packet Tracer logic: same group → crossover, different → straight-through)
    const medio = l.link.medium
    const grupo = (t: string): string => (['switch', 'l3switch', 'hub'].includes(t) ? 'sw' : 'dte')
    if (medio === 'copper-straight' || medio === 'copper-cross') {
      const iguales = grupo(l.a.dev.type) === grupo(l.b.dev.type)
      const esperado = iguales ? 'copper-cross' : 'copper-straight'
      if (medio !== esperado) {
        diags.push({ severity: 'info', code: 'CABLE-TYPE', message: `${desc}: by the classic rule this needs a ${esperado === 'copper-cross' ? 'crossover cable' : 'straight-through cable'}. With Auto-MDIX it works anyway; in PT a wrong cable can leave the link down.`, subject: sujeto })
      }
    }
    const serialA = /^serial/i.test(l.a.iface.name)
    const serialB = /^serial/i.test(l.b.iface.name)
    if (medio === 'serial') {
      for (const e of [l.a, l.b]) {
        if (!/^serial/i.test(e.iface.name)) diags.push({ severity: 'error', code: 'SERIAL-MEDIUM', message: `Link ${l.id} is serial but ${e.dev.id} ${e.iface.name} is not a Serial interface.`, subject: sujeto })
      }
    } else if ((serialA || serialB) && medio && medio !== 'auto') {
      diags.push({ severity: 'error', code: 'SERIAL-MEDIUM', message: `${desc}: a Serial interface requires a serial cable (DCE/DTE), not "${medio}".`, subject: sujeto, hint: 'Use "medium": "serial" and "dce": "a" or "b".' })
    } else if (serialA !== serialB) {
      diags.push({ severity: 'error', code: 'SERIAL-MEDIUM', message: `${desc}: only one end is Serial; both ends must be serial interfaces.`, subject: sujeto })
    }
    if (serialA && serialB) {
      // DCE declared, or inferred from the end that has a clock rate
      const dce = l.link.dce === 'a' ? l.a : l.link.dce === 'b' ? l.b : l.a.iface.clockRate ? l.a : l.b.iface.clockRate ? l.b : undefined
      const dte = dce === l.a ? l.b : dce === l.b ? l.a : undefined
      if (!dce) {
        diags.push({ severity: 'warning', code: 'SERIAL-NO-DCE', message: `${desc}: no DCE end is specified and neither end has a clock rate.`, subject: sujeto, hint: 'Add "dce": "a" to the link and "clockRate": 64000 to that interface.' })
      } else if (!dce.iface.clockRate) {
        diags.push({ severity: 'warning', code: 'SERIAL-NO-CLOCK', message: `${dce.dev.id} ${dce.iface.name} is the DCE end but has no clock rate.`, subject: sujeto, hint: 'Add "clockRate": 64000. Some PT versions assign it automatically.' })
      }
      if (dte?.iface.clockRate) {
        diags.push({ severity: 'warning', code: 'SERIAL-CLOCK-ON-DTE', message: `${dte.dev.id} ${dte.iface.name} is the DTE end and has a clock rate; it does not apply on DTE.`, subject: sujeto, hint: 'Keep "clockRate" only on the DCE end.' })
      }
    }
  }

  // Per-port rules
  for (const d of devices.values()) {
    const esSwitch = d.type === 'switch' || d.type === 'l3switch'
    for (const i of d.ifaces) {
      const sujeto = { device: d.id, interface: i.name }
      if (esSwitch && i.mode === 'access' && i.vlan !== undefined && i.vlan !== 1 && declaradas.size && !declaradas.has(i.vlan)) {
        diags.push({ severity: 'warning', code: 'VLAN-UNDECLARED', message: `${d.id} ${i.name} uses VLAN ${i.vlan}, which is not in "vlans".`, subject: { ...sujeto, vlan: i.vlan } })
      }
      if (esSwitch && d.vlans && i.mode === 'access' && i.vlan !== undefined && i.vlan !== 1 && !d.vlans.includes(i.vlan)) {
        diags.push({ severity: 'error', code: 'VLAN-NOT-CREATED', message: `${d.id} ${i.name} uses VLAN ${i.vlan} but the switch does not create it (devices[].vlans).`, subject: { ...sujeto, vlan: i.vlan } })
      }
      if (i.portSecurity && i.mode !== 'access') {
        diags.push({ severity: 'warning', code: 'PORTSEC-MODE', message: `${d.id} ${i.name}: port-security applies to static access ports.`, subject: sujeto })
      }
      if (i.mode === 'subinterface' && !esSwitch && !d.ifByKey.has(i.parentKey!)) {
        diags.push({ severity: 'error', code: 'SUBIF-NO-PARENT', message: `${d.id} ${i.name}: the physical interface ${i.name.split('.')[0]} must be declared (it requires no shutdown).`, subject: sujeto })
      }
      if (i.mode === 'subinterface' && esSwitch) {
        diags.push({ severity: 'error', code: 'SUBIF-ON-SWITCH', message: `${d.id} ${i.name}: switches use SVIs (interface VlanX), not subinterfaces.`, subject: sujeto })
      }
      if (i.channelGroup && esSwitch) {
        const po = d.ifByKey.get(`port-channel${i.channelGroup.id}`)
        const lista = (x: NIface): string => (Array.isArray(x.allowedVlans) ? x.allowedVlans.join(',') : 'all')
        if (po && (po.mode !== i.mode || (po.nativeVlan ?? 1) !== (i.nativeVlan ?? 1) || lista(po) !== lista(i) || (po.mode === 'access' && po.vlan !== i.vlan))) {
          diags.push({ severity: 'error', code: 'ETHERCHANNEL-MEMBER-MISMATCH', message: `${d.id} ${i.name}: its L2 configuration differs from Port-channel${i.channelGroup.id}; the member will be suspended.`, subject: sujeto, hint: 'Members must have the same mode, native VLAN and allowed VLANs as the Port-channel.' })
        }
      }
      if (d.type === 'switch' && i.mode === 'routed') {
        diags.push({ severity: 'error', code: 'ROUTED-PORT-L2-SWITCH', message: `${d.id} ${i.name}: an L2 switch does not support routed ports ("no switchport").`, subject: sujeto })
      }
    }
    if (d.type === 'switch') {
      const svis = d.ifaces.filter((i) => i.mode === 'svi' && i.cidr)
      if (svis.length > 1) {
        diags.push({ severity: 'warning', code: 'L2-MULTIPLE-SVI', message: `${d.id} is L2 and has ${svis.length} SVIs with IP; an L2 switch does not route between them (management only).`, subject: { device: d.id } })
      }
    }
  }
}
