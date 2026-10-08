// Simulación de STP por VLAN (PVST+/Rapid PVST+): root bridge, puertos root/designated/alternate.
// Bridge ID = prioridad + VLAN (extended system ID) + MAC. Sin MAC en el modelo, el desempate usa el id
// del equipo y se avisa: en el equipo real decide la MAC más baja.

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
  blocked: Map<string, { a: number[]; b: number[] }>   // enlace → VLAN bloqueadas en cada extremo
}

export function bridgePriority(dev: Device, vlan: number): number {
  const s = dev.stp
  const p = s?.priorities?.find((x) => x.vlans.includes(vlan))
  if (p) return p.priority
  if (s?.rootPrimary?.includes(vlan)) return 24576
  if (s?.rootSecondary?.includes(vlan)) return 28672
  return 32768
}

/** Costo STP (método corto, el de PVST+ por defecto) según la velocidad en Mbps. */
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

/** Comparación lexicográfica de tuplas numéricas (criterios de desempate de STP). */
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
  // Identificador de puerto: prioridad (128) + número de orden de la interfaz
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
    // Enlaces lógicos entre switches (los miembros de un EtherChannel cuentan como uno)
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
    // Dominios STP independientes: componentes conectados por enlaces lógicos
    const padre = new Map<string, string>(miembros.map((d) => [d.id, d.id]))
    const raizC = (x: string): string => { while (padre.get(x) !== x) x = padre.get(x)!; return x }
    for (const l of logicos.values()) padre.set(raizC(l.a), raizC(l.b))
    const grupos = new Map<string, NDevice[]>()
    for (const d of miembros) grupos.set(raizC(d.id), [...(grupos.get(raizC(d.id)) ?? []), d])
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue
      const enGrupo = new Set(grupo.map((d) => d.id))
      const logicosG = [...logicos.values()].filter((l) => enGrupo.has(l.a))
      // Bridge ID y root
      const bid = (d: NDevice): [number, string] => [bridgePriority(d, vlan) + vlan, macDe(d) || `~${d.id}`]
      const cmpBid = (x: NDevice, y: NDevice): number => {
        const [px, mx] = bid(x)
        const [py, my] = bid(y)
        return px - py || (mx < my ? -1 : mx > my ? 1 : 0)
      }
      const orden = [...grupo].sort(cmpBid)
      const root = orden[0]
      const empate = orden.length > 1 && bid(orden[0])[0] === bid(orden[1])[0]
      // Costo de ruta al root (Dijkstra con el costo del puerto que recibe hacia el root)
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
          // el vecino recibe por su propio puerto: su costo es el del otro lado del enlace
          const costoVecino = e.lado === 'a' ? e.l.costB : e.l.costA
          const nd = rpc.get(u)! + costoVecino
          if (!rpc.has(e.peer) || nd < rpc.get(e.peer)!) rpc.set(e.peer, nd)
        }
      }
      const dev = (id: string): NDevice => devices.get(id)!
      // Puerto root de cada switch no root
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
      // Rol de cada extremo de cada enlace lógico
      const puertos: StpVlan['ports'] = []
      for (const l of logicosG) {
        const ra = rootPort.get(l.a)
        const rb = rootPort.get(l.b)
        const esRootA = ra?.l === l && ra.lado === 'a'
        const esRootB = rb?.l === l && rb.lado === 'b'
        // designado: menor costo al root, luego menor BID, luego menor port ID
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

  // Diagnósticos de diseño STP
  const porRoot = new Map<string, number[]>()
  for (const v of resultado.vlans) porRoot.set(v.root, [...(porRoot.get(v.root) ?? []), v.vlan])
  for (const [r, vs] of porRoot) {
    diags.push({ severity: 'info', code: 'STP-ROOT', message: `STP: ${r} es root bridge de la(s) VLAN ${vs.join(', ')}.`, subject: { device: r } })
  }
  for (const v of resultado.vlans) {
    const r = devices.get(v.root)!
    const hayMejor = [...devices.values()].some((d) => d.id !== r.id && (d.type === 'l3switch' || d.role === 'core' || d.role === 'distribution') && v.ports.some((p) => p.device === d.id))
    if ((r.role === 'access' || (r.type === 'switch' && !r.role)) && hayMejor && v.hasHosts) {
      diags.push({ severity: 'warning', code: 'STP-ROOT-UNDESIRED', message: `STP VLAN ${v.vlan}: el root es ${r.id} (acceso); el tráfico puede tomar caminos subóptimos.`, subject: { device: r.id, vlan: v.vlan }, hint: 'Configure "stp.rootPrimary" en el switch core/distribución (spanning-tree vlan X root primary).' })
    }
  }
  // El desempate por MAC solo importa si hay caminos redundantes (puertos bloqueados)
  const empates = resultado.vlans.filter((v) => v.tieByMac && sinMac && v.hasHosts && v.ports.some((p) => p.role === 'alternate')).map((v) => v.vlan)
  if (empates.length) {
    diags.push({ severity: 'warning', code: 'STP-TIE-MAC', message: `STP VLAN ${empates.join(', ')}: hay bucles y empate de prioridad; el root se eligió por id porque el modelo no tiene "mac". En el equipo real decide la MAC más baja.`, hint: 'Fije el root con "stp.rootPrimary" (y rootSecondary) en el core/distribución.' })
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
    diags.push({ severity: 'info', code: 'STP-BLOCKED', message: `STP: ${b.device} ${b.iface} queda bloqueado (alternate) en VLAN ${b.vlans.join(', ')} para evitar un bucle.`, subject: { device: b.device, interface: b.iface } })
  }
  return resultado
}
