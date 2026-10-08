// Per-VLAN STP simulation (PVST+/Rapid PVST+): root bridge, root/designated/alternate ports.
// Bridge ID = priority + VLAN (extended system ID) + MAC. Without a MAC in the model, ties are broken by the
// device id and a warning is issued: on real devices the lowest MAC wins.

import type { Device, Diagnostic, NetworkModel } from './model.ts'
import type { NDevice, NIface } from './normalize.ts'
import { ifUp } from './normalize.ts'
import type { ResolvedLink } from './l2.ts'
import { effectivePort, knownVlans, trunkAllowed } from './l2.ts'
import { naturalCompare } from './names.ts'

export type PortRole = 'root' | 'designated' | 'alternate'

export interface StpVlan {
  vlan: number
  root: string
  rootPriority: number
  tieByMac: boolean
  hasHosts: boolean
  ports: { device: string; iface: string; role: PortRole; link: string; cost: number }[]
  rootPathCost: Record<string, number>
}

export interface StpResult {
  vlans: StpVlan[]
  blocked: Map<string, { a: number[]; b: number[] }>   // link → blocked VLANs on each end
}

export function bridgePriority(dev: Device, vlan: number): number {
  const s = dev.stp
  const p = s?.priorities?.find((x) => x.vlans.includes(vlan))
  if (p) return p.priority
  if (s?.rootPrimary?.includes(vlan)) return 24576
  if (s?.rootSecondary?.includes(vlan)) return 28672
  return 32768
}

/** STP cost (short method, the PVST+ default) based on speed in Mbps. */
export function stpCostFor(mbps: number): number {
  if (mbps >= 10000) return 2
  if (mbps >= 2000) return 3
  if (mbps >= 1000) return 4
  if (mbps >= 200) return 12
  if (mbps >= 100) return 19
  return 100
}

function speedMbps(i: NIface): number {
  if (i.speed && /^\d+$/.test(i.speed)) return Number(i.speed)
  const k = i.name.toLowerCase()
  if (k.startsWith('tengig')) return 10000
  if (k.startsWith('gigabit')) return 1000
  if (k.startsWith('fastethernet')) return 100
  if (k.startsWith('ethernet')) return 10
  return 1000
}

function carries(dev: NDevice, i: NIface, vlan: number, vlans: number[]): boolean {
  if (!ifUp(i)) return false
  const e = effectivePort(dev, i)
  if (e.mode === 'access') return (e.vlan ?? 1) === vlan
  if (e.mode === 'trunk') return trunkAllowed(e, vlans).includes(vlan)
  return false
}

/** Lexicographic comparison of numeric tuples (STP tie-breaking criteria). */
function lexMenor(x: number[], y: number[]): boolean {
  for (let n = 0; n < x.length; n++) if (x[n] !== y[n]) return x[n] < y[n]
  return false
}

interface Logico { id: string; a: string; b: string; ia: string; ib: string; costA: number; costB: number; pidA: number; pidB: number; links: string[] }

export function computeStp(model: NetworkModel, devices: Map<string, NDevice>, links: ResolvedLink[], diags: Diagnostic[]): StpResult {
  const vlans = knownVlans(model, devices)
  const resultado: StpResult = { vlans: [], blocked: new Map() }
  const switches = [...devices.values()].filter((d) => d.type === 'switch' || d.type === 'l3switch')
  if (switches.length < 2) return resultado
  // Port ID: priority (128) + interface ordinal
  const portId = (d: NDevice, i: NIface): number => {
    const orden = [...d.ifaces].sort((x, y) => naturalCompare(x.name, y.name)).indexOf(i) + 1
    return (i.stp?.portPriority ?? 128) * 4096 + orden
  }
  const macDe = (d: NDevice): string => (d.mac ?? '').toLowerCase().replace(/[^0-9a-f]/g, '')
  const sinMac = switches.some((d) => !macDe(d))

  for (const vlan of vlans) {
    const miembros = switches.filter((d) => d.ifaces.some((i) => (i.mode === 'access' || i.mode === 'trunk') && carries(d, i, vlan, vlans)))
    if (miembros.length < 2) continue
    const ids = new Set(miembros.map((d) => d.id))
    // Logical links between switches (EtherChannel members count as one)
    const logicos = new Map<string, Logico>()
    for (const l of links) {
      if (l.link.status === 'down' || !ids.has(l.a.dev.id) || !ids.has(l.b.dev.id) || l.a.dev.id === l.b.dev.id) continue
      if (!carries(l.a.dev, l.a.iface, vlan, vlans) || !carries(l.b.dev, l.b.iface, vlan, vlans)) continue
      const ca = l.a.iface.channelGroup
      const cb = l.b.iface.channelGroup
      const nombreA = ca ? `Port-channel${ca.id}` : l.a.iface.name
      const nombreB = cb ? `Port-channel${cb.id}` : l.b.iface.name
      const k = ca && cb ? `${l.a.dev.id}|${nombreA}|${l.b.dev.id}|${nombreB}` : l.id
      const vel = speedMbps(l.a.iface)
      const prev = logicos.get(k)
      if (prev) {
        prev.links.push(l.id)
        const total = vel * prev.links.length
        prev.costA = l.a.iface.stp?.cost ?? stpCostFor(total)
        prev.costB = l.b.iface.stp?.cost ?? stpCostFor(total)
        continue
      }
      const poA = ca ? l.a.dev.ifByKey.get(`port-channel${ca.id}`) : undefined
      const poB = cb ? l.b.dev.ifByKey.get(`port-channel${cb.id}`) : undefined
      logicos.set(k, {
        id: k, a: l.a.dev.id, b: l.b.dev.id, ia: nombreA, ib: nombreB,
        costA: l.a.iface.stp?.cost ?? stpCostFor(vel), costB: l.b.iface.stp?.cost ?? stpCostFor(vel),
        pidA: portId(l.a.dev, poA ?? l.a.iface), pidB: portId(l.b.dev, poB ?? l.b.iface), links: [l.id],
      })
    }
    // Independent STP domains: components connected by logical links
    const padre = new Map<string, string>(miembros.map((d) => [d.id, d.id]))
    const raizC = (x: string): string => { while (padre.get(x) !== x) x = padre.get(x)!; return x }
    for (const l of logicos.values()) padre.set(raizC(l.a), raizC(l.b))
    const grupos = new Map<string, NDevice[]>()
    for (const d of miembros) grupos.set(raizC(d.id), [...(grupos.get(raizC(d.id)) ?? []), d])
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue
      const enGrupo = new Set(grupo.map((d) => d.id))
      const logicosG = [...logicos.values()].filter((l) => enGrupo.has(l.a))
      // Bridge ID and root bridge
      const bid = (d: NDevice): [number, string] => [bridgePriority(d, vlan) + vlan, macDe(d) || `~${d.id}`]
      const cmpBid = (x: NDevice, y: NDevice): number => {
        const [px, mx] = bid(x)
        const [py, my] = bid(y)
        return px - py || (mx < my ? -1 : mx > my ? 1 : 0)
      }
      const orden = [...grupo].sort(cmpBid)
      const root = orden[0]
      const empate = orden.length > 1 && bid(orden[0])[0] === bid(orden[1])[0]
      // Root path cost (Dijkstra using the cost of the port that receives toward the root)
      const rpc = new Map<string, number>([[root.id, 0]])
      const hecho = new Set<string>()
      const adj = new Map<string, { peer: string; costPropio: number; l: Logico; lado: 'a' | 'b' }[]>()
      for (const l of logicosG) {
        ;(adj.get(l.a) ?? adj.set(l.a, []).get(l.a)!).push({ peer: l.b, costPropio: l.costA, l, lado: 'a' })
        ;(adj.get(l.b) ?? adj.set(l.b, []).get(l.b)!).push({ peer: l.a, costPropio: l.costB, l, lado: 'b' })
      }
      while (true) {
        let u: string | undefined
        for (const [k, v] of rpc) if (!hecho.has(k) && (u === undefined || v < rpc.get(u)!)) u = k
        if (u === undefined) break
        hecho.add(u)
        for (const e of adj.get(u) ?? []) {
          // the neighbor receives on its own port: its cost is that of the other side of the link
          const costoVecino = e.lado === 'a' ? e.l.costB : e.l.costA
          const nd = rpc.get(u)! + costoVecino
          if (!rpc.has(e.peer) || nd < rpc.get(e.peer)!) rpc.set(e.peer, nd)
        }
      }
      const dev = (id: string): NDevice => devices.get(id)!
      // Root port of each non-root switch
      const rootPort = new Map<string, { l: Logico; lado: 'a' | 'b' }>()
      for (const d of grupo) {
        if (d === root || !rpc.has(d.id)) continue
        let mejor: { clave: [number, number, number, number]; l: Logico; lado: 'a' | 'b' } | undefined
        for (const e of adj.get(d.id) ?? []) {
          if (!rpc.has(e.peer)) continue
          const costo = rpc.get(e.peer)! + e.costPropio
          const vecino = dev(e.peer)
          const pidVecino = e.lado === 'a' ? e.l.pidB : e.l.pidA
          const pidPropio = e.lado === 'a' ? e.l.pidA : e.l.pidB
          const rank = orden.indexOf(vecino)
          const clave: [number, number, number, number] = [costo, rank, pidVecino, pidPropio]
          if (!mejor || lexMenor(clave, mejor.clave)) mejor = { clave, l: e.l, lado: e.lado }
        }
        if (mejor) rootPort.set(d.id, { l: mejor.l, lado: mejor.lado })
      }
      // Role of each end of each logical link
      const puertos: StpVlan['ports'] = []
      for (const l of logicosG) {
        const ra = rootPort.get(l.a)
        const rb = rootPort.get(l.b)
        const esRootA = ra?.l === l && ra.lado === 'a'
        const esRootB = rb?.l === l && rb.lado === 'b'
        // designated: lowest root path cost, then lowest BID, then lowest port ID
        const ka: [number, number, number] = [rpc.get(l.a) ?? Infinity, orden.indexOf(dev(l.a)), l.pidA]
        const kb: [number, number, number] = [rpc.get(l.b) ?? Infinity, orden.indexOf(dev(l.b)), l.pidB]
        const aGana = ka[0] < kb[0] || (ka[0] === kb[0] && (ka[1] < kb[1] || (ka[1] === kb[1] && ka[2] <= kb[2])))
        const rolA: PortRole = esRootA ? 'root' : aGana ? 'designated' : 'alternate'
        const rolB: PortRole = esRootB ? 'root' : !aGana ? 'designated' : 'alternate'
        puertos.push({ device: l.a, iface: l.ia, role: rolA, link: l.links.join('+'), cost: l.costA })
        puertos.push({ device: l.b, iface: l.ib, role: rolB, link: l.links.join('+'), cost: l.costB })
        for (const lid of l.links) {
          if (!resultado.blocked.has(lid)) resultado.blocked.set(lid, { a: [], b: [] })
          const r = resultado.blocked.get(lid)!
          const real = links.find((x) => x.id === lid)!
          const aEsA = real.a.dev.id === l.a
          if (rolA === 'alternate') (aEsA ? r.a : r.b).push(vlan)
          if (rolB === 'alternate') (aEsA ? r.b : r.a).push(vlan)
        }
      }
      const conHosts = grupo.some((d) => d.ifaces.some((i) => effectivePort(d, i).mode === 'access' && carries(d, i, vlan, vlans)))
      resultado.vlans.push({ vlan, root: root.id, rootPriority: bid(root)[0], tieByMac: empate, hasHosts: conHosts, ports: puertos, rootPathCost: Object.fromEntries(rpc) })
    }
  }

  // STP design diagnostics
  const porRoot = new Map<string, number[]>()
  for (const v of resultado.vlans) porRoot.set(v.root, [...(porRoot.get(v.root) ?? []), v.vlan])
  for (const [r, vs] of porRoot) {
    diags.push({ severity: 'info', code: 'STP-ROOT', message: `STP: ${r} is the root bridge for VLAN(s) ${vs.join(', ')}.`, subject: { device: r } })
  }
  for (const v of resultado.vlans) {
    const r = devices.get(v.root)!
    const hayMejor = [...devices.values()].some((d) => d.id !== r.id && (d.type === 'l3switch' || d.role === 'core' || d.role === 'distribution') && v.ports.some((p) => p.device === d.id))
    if ((r.role === 'access' || (r.type === 'switch' && !r.role)) && hayMejor && v.hasHosts) {
      diags.push({ severity: 'warning', code: 'STP-ROOT-UNDESIRED', message: `STP VLAN ${v.vlan}: the root bridge is ${r.id} (access layer); traffic may take suboptimal paths.`, subject: { device: r.id, vlan: v.vlan }, hint: 'Configure "stp.rootPrimary" on the core/distribution switch (spanning-tree vlan X root primary).' })
    }
  }
  // The MAC tie-break only matters if there are redundant paths (blocked ports)
  const empates = resultado.vlans.filter((v) => v.tieByMac && sinMac && v.hasHosts && v.ports.some((p) => p.role === 'alternate')).map((v) => v.vlan)
  if (empates.length) {
    diags.push({ severity: 'warning', code: 'STP-TIE-MAC', message: `STP VLAN ${empates.join(', ')}: there are loops and a priority tie; the root bridge was chosen by id because the model has no "mac". On real devices the lowest MAC wins.`, hint: 'Pin the root bridge with "stp.rootPrimary" (and rootSecondary) on core/distribution.' })
  }
  const bloqueados = new Map<string, { device: string; iface: string; vlans: number[] }>()
  for (const v of resultado.vlans) {
    for (const p of v.ports.filter((x) => x.role === 'alternate')) {
      const k = `${p.device}|${p.iface}`
      if (!bloqueados.has(k)) bloqueados.set(k, { device: p.device, iface: p.iface, vlans: [] })
      bloqueados.get(k)!.vlans.push(v.vlan)
    }
  }
  for (const b of bloqueados.values()) {
    diags.push({ severity: 'info', code: 'STP-BLOCKED', message: `STP: ${b.device} ${b.iface} is a blocked port (alternate) in VLAN ${b.vlans.join(', ')} to prevent a loop.`, subject: { device: b.device, interface: b.iface } })
  }
  return resultado
}
