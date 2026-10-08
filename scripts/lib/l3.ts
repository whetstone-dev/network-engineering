// Capa 3 IPv4: tablas de routing simuladas (conectadas, estáticas, OSPF, EIGRP, RIP, BGP) y HSRP.
// Es una simulación a nivel de modelo: aproxima el comportamiento de IOS para detectar
// errores de diseño. El trazado de paquetes está en trace.ts. No sustituye a Packet Tracer.

import type { Diagnostic, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { NDevice, NIface } from './normalize.ts'
import { findIface, ifUp } from './normalize.ts'
import type { Segment } from './l2.ts'
import type { Cidr4 } from './ip.ts'
import { classfulNetwork, containsIp, formatIpv4, networkOf, parseCidr4, parseIpv4 } from './ip.ts'
import { ifKey } from './names.ts'

export type RouteProto = 'C' | 'L' | 'S' | 'S*' | 'O' | 'O*' | 'D' | 'R' | 'R*' | 'B'

export interface Route {
  proto: RouteProto
  network: number
  prefix: number
  ad: number
  metric: number
  nextHop?: number
  iface?: string               // nombre de la interfaz de salida
  ifaceKey?: string
  learnedFrom?: string         // dispositivo que originó la ruta
}

export interface RouteView { code: string; prefix: string; adMetric: string; via: string; iface: string }

export interface HsrpState { device: string; iface: string; group: number; vip: string; priority: number; role: 'active' | 'standby' | 'listen'; segment: string }

const AD: Record<string, number> = { C: 0, L: 0, S: 1, B: 20, D: 90, O: 110, R: 120 }

export interface L3Context {
  devices: Map<string, NDevice>
  segmentOf: Map<string, Segment>
  hostIp: Map<string, { ip: number; prefix: number; gateway?: number; simulated: boolean }>
  tables: Map<string, Route[]>
  hsrpActive: Map<Segment, Map<number, NIface>>   // VIP → interfaz activa, por dominio L2
  hsrp: HsrpState[]
}

export function newContext(): L3Context {
  return { devices: new Map(), segmentOf: new Map(), hostIp: new Map(), tables: new Map(), hsrpActive: new Map(), hsrp: [] }
}

export function routesDevice(d: NDevice): boolean {
  if (HOST_TYPES.has(d.type) || d.type === 'switch' || d.type === 'ap' || d.type === 'hub' || d.type === 'modem') return false
  if (d.type === 'l3switch') return d.routing?.ipRouting !== false
  return d.ifaces.some((i) => i.cidr)
}

export function segOf(ctx: L3Context, i: NIface): Segment | undefined {
  return ctx.segmentOf.get(`${i.deviceId}|${i.key}`)
}

export function l3Up(d: NDevice, i: NIface): boolean {
  if (!ifUp(i) || !i.cidr) return false
  if (i.parentKey) {
    const padre = d.ifByKey.get(i.parentKey)
    if (padre && !ifUp(padre)) return false
  }
  return true
}

/** Coincidencia de "network X wildcard" estilo IOS contra la IP de una interfaz. */
function networkStatementMatches(stmt: string, ip: number, classful: boolean): boolean {
  const c = parseCidr4(stmt.includes('/') || stmt.includes(' ') ? stmt : classful ? `${stmt}/${classfulNetwork(parseIpv4(stmt) ?? 0).prefix}` : `${stmt}/32`)
  if (!c) return false
  return containsIp({ ip: networkOf(c.ip, c.prefix), prefix: c.prefix }, ip)
}

interface Participation { iface: NIface; passive: boolean; area?: string }

function participation(d: NDevice, proto: 'ospf' | 'eigrp' | 'rip'): Participation[] {
  const r = d.routing
  const res: Participation[] = []
  const l3 = d.ifaces.filter((i) => l3Up(d, i))
  if (proto === 'ospf' && r?.ospf) {
    const pasivas = new Set((r.ospf.passiveInterfaces ?? []).map(ifKey))
    for (const i of l3) {
      let area: string | undefined = i.ospf ? String(i.ospf.area) : undefined
      if (area === undefined) {
        const st = (r.ospf.networks ?? []).find((n) => networkStatementMatches(n.prefix, i.cidr!.ip, false))
        if (st) area = String(st.area)
      }
      if (area !== undefined) res.push({ iface: i, passive: pasivas.has(i.key) || !!i.ospf?.passive, area })
    }
  }
  if (proto === 'eigrp' && r?.eigrp) {
    const pasivas = new Set((r.eigrp.passiveInterfaces ?? []).map(ifKey))
    for (const i of l3) {
      const incluida = r.eigrp.networks ? r.eigrp.networks.some((n) => networkStatementMatches(n, i.cidr!.ip, true)) : i.nat !== 'outside'
      if (incluida) res.push({ iface: i, passive: pasivas.has(i.key) })
    }
  }
  if (proto === 'rip' && r?.rip) {
    const pasivas = new Set((r.rip.passiveInterfaces ?? []).map(ifKey))
    for (const i of l3) {
      const red = classfulNetwork(i.cidr!.ip)
      const incluida = r.rip.networks
        ? r.rip.networks.some((n) => { const ip = parseIpv4(n.split('/')[0]); return ip !== null && classfulNetwork(ip).ip === red.ip })
        : i.nat !== 'outside'
      if (incluida) res.push({ iface: i, passive: pasivas.has(i.key) })
    }
  }
  return res
}

function baseName(d: NDevice, i: NIface): string {
  return ((i.parentKey ? d.ifByKey.get(i.parentKey)?.name : i.name) ?? i.name).toLowerCase()
}

/** Ancho de banda por defecto (kbps) según el tipo de interfaz, como lo asume IOS. */
export function defaultBandwidth(d: NDevice, i: NIface): number {
  if (i.bandwidth) return i.bandwidth
  const k = baseName(d, i)
  if (k.startsWith('serial')) return 1544
  if (k.startsWith('fastethernet')) return 100000
  if (k.startsWith('tengigabit')) return 10000000
  if (k.startsWith('gigabitethernet') || k.startsWith('vlan') || k.startsWith('port-channel')) return 1000000
  if (k.startsWith('ethernet')) return 10000
  if (k.startsWith('loopback')) return 8000000
  return 1000000
}

/** Retardo EIGRP por defecto (microsegundos) según el tipo de interfaz. */
export function eigrpDelay(d: NDevice, i: NIface): number {
  const k = baseName(d, i)
  if (k.startsWith('serial')) return 20000
  if (k.startsWith('fastethernet')) return 100
  if (k.startsWith('ethernet')) return 1000
  if (k.startsWith('loopback')) return 5000
  if (k.startsWith('tunnel')) return 50000
  return 10
}

/** Métrica compuesta EIGRP con K1=K3=1 (valores por defecto): 256 × (10^7/BWmin + Σretardo/10). */
export function eigrpMetric(bwKbps: number, delayUs: number): number {
  return 256 * (Math.floor(10_000_000 / bwKbps) + Math.floor(delayUs / 10))
}

/** Costo OSPF = ancho de banda de referencia / ancho de banda de la interfaz (mínimo 1). */
export function ospfCost(d: NDevice, i: NIface, override?: number): number {
  if (override) return override
  if (i.ospf?.cost) return i.ospf.cost
  const ref = (d.routing?.ospf?.referenceBandwidth ?? 100) * 1000
  return Math.max(1, Math.floor(ref / defaultBandwidth(d, i)))
}

export function lookup(tabla: Route[], ip: number): Route | undefined {
  let mejor: Route | undefined
  for (const r of tabla) {
    if (r.proto === 'L') continue
    if (networkOf(ip, r.prefix) !== r.network) continue
    if (!mejor || r.prefix > mejor.prefix || (r.prefix === mejor.prefix && (r.ad < mejor.ad || (r.ad === mejor.ad && r.metric < mejor.metric)))) mejor = r
  }
  return mejor
}

// ---------------- HSRP ----------------

/** Elige el router activo de cada grupo HSRP (mayor prioridad; empate: mayor IP) y valida la configuración. */
export function computeHsrp(ctx: L3Context, diags: Diagnostic[]): void {
  const grupos = new Map<string, { seg: Segment; ifs: NIface[] }>()
  for (const d of ctx.devices.values()) {
    for (const i of d.ifaces) {
      if (!i.hsrp) continue
      const sujeto = { device: d.id, interface: i.name }
      const vip = parseIpv4(i.hsrp.ip)
      if (vip === null) { diags.push({ severity: 'error', code: 'HSRP-VIP-INVALID', message: `${d.id} ${i.name}: IP virtual HSRP inválida "${i.hsrp.ip}".`, subject: sujeto }); continue }
      if (!i.cidr) { diags.push({ severity: 'error', code: 'HSRP-NO-IP', message: `${d.id} ${i.name}: HSRP requiere una IP real en la interfaz.`, subject: sujeto }); continue }
      if (!containsIp(i.cidr, vip)) diags.push({ severity: 'error', code: 'HSRP-VIP-OUTSIDE', message: `${d.id} ${i.name}: la IP virtual ${i.hsrp.ip} no pertenece a la subred de la interfaz.`, subject: sujeto })
      if (vip === i.cidr.ip) diags.push({ severity: 'error', code: 'HSRP-VIP-IS-REAL', message: `${d.id} ${i.name}: la IP virtual no puede ser la IP real de la interfaz.`, subject: sujeto })
      if (i.hsrp.group > 255 && i.hsrp.version !== 2) diags.push({ severity: 'error', code: 'HSRP-GROUP-RANGE', message: `${d.id} ${i.name}: HSRPv1 admite grupos 0-255; use version 2 (0-4095).`, subject: sujeto })
      const seg = segOf(ctx, i)
      if (!seg || !l3Up(d, i)) continue
      const k = `${seg.id}|${i.hsrp.group}`
      if (!grupos.has(k)) grupos.set(k, { seg, ifs: [] })
      grupos.get(k)!.ifs.push(i)
    }
  }
  for (const { seg, ifs } of grupos.values()) {
    const vips = new Set(ifs.map((i) => i.hsrp!.ip))
    if (vips.size > 1) {
      diags.push({ severity: 'error', code: 'HSRP-VIP-MISMATCH', message: `HSRP grupo ${ifs[0].hsrp!.group}: los miembros usan IP virtuales distintas (${[...vips].join(', ')}).`, subject: { device: ifs[0].deviceId, interface: ifs[0].name } })
    }
    const versiones = new Set(ifs.map((i) => i.hsrp!.version ?? 1))
    if (versiones.size > 1) diags.push({ severity: 'error', code: 'HSRP-VERSION-MISMATCH', message: `HSRP grupo ${ifs[0].hsrp!.group}: versiones distintas entre miembros.`, subject: { device: ifs[0].deviceId } })
    const orden = [...ifs].sort((a, b) => (b.hsrp!.priority ?? 100) - (a.hsrp!.priority ?? 100) || b.cidr!.ip - a.cidr!.ip)
    if (ifs.length === 1) diags.push({ severity: 'info', code: 'HSRP-SINGLE', message: `HSRP grupo ${ifs[0].hsrp!.group} (${ifs[0].hsrp!.ip}) tiene un solo router: no hay redundancia.`, subject: { device: ifs[0].deviceId, interface: ifs[0].name } })
    const activo = orden[0]
    if (orden.length > 1 && (activo.hsrp!.priority ?? 100) > (orden[1].hsrp!.priority ?? 100) && !activo.hsrp!.preempt) {
      diags.push({ severity: 'info', code: 'HSRP-NO-PREEMPT', message: `${activo.deviceId} ${activo.name}: tiene mayor prioridad HSRP pero sin preempt; tras un reinicio no recupera el rol activo.`, subject: { device: activo.deviceId, interface: activo.name } })
    }
    if (!ctx.hsrpActive.has(seg)) ctx.hsrpActive.set(seg, new Map())
    ctx.hsrpActive.get(seg)!.set(parseIpv4(activo.hsrp!.ip)!, activo)
    orden.forEach((i, n) => ctx.hsrp.push({
      device: i.deviceId, iface: i.name, group: i.hsrp!.group, vip: i.hsrp!.ip, priority: i.hsrp!.priority ?? 100,
      role: n === 0 ? 'active' : n === 1 ? 'standby' : 'listen', segment: seg.id,
    }))
  }
}

/** VIP HSRP de las que este equipo es el router activo. */
export function activeVips(ctx: L3Context, deviceId: string): number[] {
  const out: number[] = []
  for (const m of ctx.hsrpActive.values()) for (const [vip, i] of m) if (i.deviceId === deviceId) out.push(vip)
  return out
}

// ---------------- Tablas de routing ----------------

interface Vecino { peer: string; local: NIface; remoto: NIface }

/** Construye las tablas de routing IPv4 de todos los equipos L3. */
export function buildRouteTables(_model: NetworkModel, ctx: L3Context, diags: Diagnostic[]): void {
  const enrutadores = [...ctx.devices.values()].filter(routesDevice)
  const candidatas = new Map<string, Route[]>()

  // 1) Conectadas, locales y estáticas
  for (const d of enrutadores) {
    const rutas: Route[] = []
    for (const i of d.ifaces) {
      if (!l3Up(d, i)) continue
      const c = i.cidr!
      rutas.push({ proto: 'C', network: networkOf(c.ip, c.prefix), prefix: c.prefix, ad: 0, metric: 0, iface: i.name, ifaceKey: i.key })
      if (c.prefix < 32) rutas.push({ proto: 'L', network: c.ip, prefix: 32, ad: 0, metric: 0, iface: i.name, ifaceKey: i.key })
    }
    for (const s of d.routing?.static ?? []) {
      const p = parseCidr4(s.prefix)
      if (!p) {
        diags.push({ severity: 'error', code: 'STATIC-INVALID', message: `${d.id}: ruta estática con prefijo inválido "${s.prefix}".`, subject: { device: d.id } })
        continue
      }
      if (networkOf(p.ip, p.prefix) !== p.ip) {
        diags.push({ severity: 'error', code: 'STATIC-HOST-BITS', message: `${d.id}: ${s.prefix} tiene bits de host; IOS lo rechaza ("Inconsistent address and mask").`, subject: { device: d.id } })
      }
      const nh = s.nextHop ? parseIpv4(s.nextHop) : null
      let salida: NIface | undefined = s.exitInterface ? findIface(d, s.exitInterface) : undefined
      if (s.exitInterface && !salida) {
        diags.push({ severity: 'error', code: 'STATIC-EXIT-IF', message: `${d.id}: la ruta ${s.prefix} usa la interfaz ${s.exitInterface}, que no existe.`, subject: { device: d.id } })
        continue
      }
      if (nh !== null && !salida) {
        const con = lookup(rutas.filter((r) => r.proto === 'C'), nh)
        if (con) salida = d.ifByKey.get(con.ifaceKey!)
      }
      if (!salida && nh === null) {
        diags.push({ severity: 'error', code: 'STATIC-NO-NEXTHOP', message: `${d.id}: la ruta ${s.prefix} no tiene next-hop ni interfaz de salida.`, subject: { device: d.id } })
        continue
      }
      if (!salida) {
        diags.push({ severity: 'warning', code: 'STATIC-UNRESOLVED', message: `${d.id}: el next-hop ${s.nextHop} de la ruta ${s.prefix} no está en una red conectada (búsqueda recursiva no simulada o next-hop incorrecto).`, subject: { device: d.id } })
        continue
      }
      rutas.push({
        proto: p.prefix === 0 ? 'S*' : 'S', network: networkOf(p.ip, p.prefix), prefix: p.prefix, ad: s.ad ?? 1, metric: 0,
        nextHop: nh ?? undefined, iface: salida.name, ifaceKey: salida.key,
      })
    }
    candidatas.set(d.id, rutas)
  }

  // 2) Protocolos dinámicos
  const protocolos: { proto: 'ospf' | 'eigrp' | 'rip'; code: RouteProto; ad: number }[] = [
    { proto: 'ospf', code: 'O', ad: AD.O },
    { proto: 'eigrp', code: 'D', ad: AD.D },
    { proto: 'rip', code: 'R', ad: AD.R },
  ]
  for (const { proto, code, ad } of protocolos) {
    const part = new Map<string, Participation[]>()
    for (const d of enrutadores) {
      const p = participation(d, proto)
      if (d.routing?.[proto] && p.length === 0) {
        diags.push({ severity: 'warning', code: `${proto.toUpperCase()}-NO-NETWORKS`, message: `${d.id}: ${proto.toUpperCase()} configurado pero ninguna interfaz participa (revise network/área).`, subject: { device: d.id } })
      }
      if (p.length) part.set(d.id, p)
    }
    if (part.size === 0) continue
    const vecinos = adjacencies(ctx, part, proto, diags)
    // anuncios: redes conectadas participantes + default si corresponde
    const anuncios = new Map<string, (Cidr4 & { cost: number; external: boolean; iface: NIface })[]>()
    for (const [id, ps] of part) {
      const d = ctx.devices.get(id)!
      const redes = ps.map((p) => ({ ip: networkOf(p.iface.cidr!.ip, p.iface.cidr!.prefix), prefix: p.iface.cidr!.prefix, cost: proto === 'ospf' ? ospfCost(d, p.iface) : 0, external: false, iface: p.iface }))
      const cfg = proto === 'ospf' ? d.routing?.ospf?.defaultOriginate : proto === 'rip' ? d.routing?.rip?.defaultOriginate : false
      const tieneDefault = candidatas.get(id)!.some((r) => r.prefix === 0)
      if (cfg && (tieneDefault || proto === 'rip')) redes.push({ ip: 0, prefix: 0, cost: 0, external: true, iface: ps[0].iface })
      else if (cfg) diags.push({ severity: 'warning', code: 'DEFAULT-ORIGINATE-NO-DEFAULT', message: `${id}: default-information originate sin ruta por defecto en la tabla; OSPF no anuncia nada (use "always" o agregue la default).`, subject: { device: id } })
      anuncios.set(id, redes)
    }
    if (proto === 'eigrp') eigrpDistanceVector(ctx, part, vecinos, anuncios, candidatas)
    else linkStateOrHops(ctx, proto, code, ad, part, vecinos, anuncios, candidatas)
  }

  // 3) BGP (sesiones directas, sin tránsito)
  for (const d of enrutadores) {
    const bgp = d.routing?.bgp
    if (!bgp) continue
    for (const n of bgp.neighbors) {
      const ipN = parseIpv4(n.ip)
      const peer = ipN === null ? undefined : [...ctx.devices.values()].find((x) => x.ifaces.some((i) => i.cidr?.ip === ipN))
      if (!peer || !peer.routing?.bgp || peer.routing.bgp.as !== n.remoteAs) {
        diags.push({ severity: 'warning', code: 'BGP-NEIGHBOR-DOWN', message: `${d.id}: el vecino BGP ${n.ip} (AS ${n.remoteAs}) no existe o no coincide en el modelo.`, subject: { device: d.id } })
        continue
      }
      const con = lookup(candidatas.get(d.id) ?? [], ipN!)
      if (!con || con.proto !== 'C') continue
      for (const red of peer.routing.bgp.networks ?? []) {
        const c = parseCidr4(red)
        if (!c) continue
        const tablaPeer = candidatas.get(peer.id) ?? []
        if (!tablaPeer.some((r) => r.network === networkOf(c.ip, c.prefix) && r.prefix === c.prefix)) {
          diags.push({ severity: 'warning', code: 'BGP-NETWORK-NOT-IN-RIB', message: `${peer.id}: "network ${red}" en BGP requiere una ruta exacta en la tabla; no se anuncia.`, subject: { device: peer.id } })
          continue
        }
        candidatas.get(d.id)!.push({
          proto: 'B', network: networkOf(c.ip, c.prefix), prefix: c.prefix, ad: bgp.as === n.remoteAs ? 200 : 20, metric: 0,
          nextHop: ipN!, iface: con.iface, ifaceKey: con.ifaceKey, learnedFrom: peer.id,
        })
      }
    }
  }

  // 4) Selección por AD (y métrica) por prefijo
  for (const [id, rutas] of candidatas) {
    const mejores = new Map<string, Route>()
    for (const r of rutas) {
      const k = `${r.network}/${r.prefix}/${r.proto === 'L' ? 'L' : ''}`
      const prev = mejores.get(k)
      if (!prev || r.ad < prev.ad || (r.ad === prev.ad && r.metric < prev.metric)) mejores.set(k, r)
    }
    ctx.tables.set(id, [...mejores.values()].sort((a, b) => a.network - b.network || a.prefix - b.prefix))
  }
}

/** Vecindades por dominio L2 con comprobación de pasivas, áreas, AS y versión. */
function adjacencies(ctx: L3Context, part: Map<string, Participation[]>, proto: 'ospf' | 'eigrp' | 'rip', diags: Diagnostic[]): Map<string, Vecino[]> {
  const vecinos = new Map<string, Vecino[]>()
  for (const id of part.keys()) vecinos.set(id, [])
  const porSegmento = new Map<Segment, { dev: string; p: Participation }[]>()
  for (const [id, ps] of part) {
    for (const p of ps) {
      const s = segOf(ctx, p.iface)
      if (!s) continue
      if (!porSegmento.has(s)) porSegmento.set(s, [])
      porSegmento.get(s)!.push({ dev: id, p })
    }
  }
  const P = proto.toUpperCase()
  for (const miembros of porSegmento.values()) {
    for (let x = 0; x < miembros.length; x++) {
      for (let y = x + 1; y < miembros.length; y++) {
        const A = miembros[x]
        const B = miembros[y]
        if (A.dev === B.dev) continue
        const da = ctx.devices.get(A.dev)!
        const db = ctx.devices.get(B.dev)!
        if (A.p.passive && B.p.passive) continue          // ambos pasivos: sin vecindad, intencional
        if (A.p.passive || B.p.passive) {
          const pas = A.p.passive ? A : B
          diags.push({ severity: 'error', code: `${P}-PASSIVE-NEIGHBOR`, message: `${pas.dev} ${pas.p.iface.name} es pasiva en ${P}, pero hay otro router en ese segmento (${A.dev === pas.dev ? B.dev : A.dev}); no se forma adyacencia.`, subject: { device: pas.dev, interface: pas.p.iface.name } })
          continue
        }
        if (proto === 'ospf' && A.p.area !== B.p.area) {
          diags.push({ severity: 'error', code: 'OSPF-AREA-MISMATCH', message: `OSPF: ${A.dev} ${A.p.iface.name} (área ${A.p.area}) y ${B.dev} ${B.p.iface.name} (área ${B.p.area}) no forman adyacencia.`, subject: { device: A.dev } })
          continue
        }
        if (proto === 'eigrp' && da.routing!.eigrp!.as !== db.routing!.eigrp!.as) {
          diags.push({ severity: 'error', code: 'EIGRP-AS-MISMATCH', message: `EIGRP: ${A.dev} (AS ${da.routing!.eigrp!.as}) y ${B.dev} (AS ${db.routing!.eigrp!.as}) no forman vecindad.`, subject: { device: A.dev } })
          continue
        }
        if (proto === 'rip' && (da.routing!.rip!.version ?? 1) !== (db.routing!.rip!.version ?? 1)) {
          diags.push({ severity: 'warning', code: 'RIP-VERSION-MISMATCH', message: `RIP: ${A.dev} y ${B.dev} usan versiones distintas.`, subject: { device: A.dev } })
        }
        vecinos.get(A.dev)!.push({ peer: B.dev, local: A.p.iface, remoto: B.p.iface })
        vecinos.get(B.dev)!.push({ peer: A.dev, local: B.p.iface, remoto: A.p.iface })
      }
    }
  }
  // Interfaces hacia otro router del mismo protocolo que no participan → no hay adyacencia
  for (const [id, ps] of part) {
    const d = ctx.devices.get(id)!
    for (const i of d.ifaces) {
      if (!l3Up(d, i) || ps.some((p) => p.iface === i)) continue
      const otro = segOf(ctx, i)?.ifaces.find((x) => x.deviceId !== id && part.get(x.deviceId)?.some((p) => p.iface === x && !p.passive))
      if (otro) {
        diags.push({
          severity: 'error', code: `${P}-NO-ADJACENCY`,
          message: `${id} ${i.name} no participa en ${P}, pero ${otro.deviceId} ${otro.name} sí, en el mismo enlace: no se forma adyacencia.`,
          subject: { device: id, interface: i.name },
          hint: proto === 'ospf' ? 'Agregue la red de ese enlace en "network ... area" (routing.ospf.networks) o "ospf.area" en la interfaz.' : 'Incluya la red del enlace en las network del protocolo.',
        })
      }
    }
  }
  return vecinos
}

/** OSPF (Dijkstra con costo ref-bw/bw) y RIP (saltos). */
function linkStateOrHops(ctx: L3Context, proto: 'ospf' | 'rip', code: RouteProto, ad: number, part: Map<string, Participation[]>,
  vecinos: Map<string, Vecino[]>, anuncios: Map<string, (Cidr4 & { cost: number; external: boolean })[]>, candidatas: Map<string, Route[]>): void {
  for (const origen of part.keys()) {
    const dist = new Map<string, number>([[origen, 0]])
    const primerSalto = new Map<string, Vecino>()
    const hecho = new Set<string>()
    while (true) {
      let u: string | undefined
      for (const [k, v] of dist) if (!hecho.has(k) && (u === undefined || v < dist.get(u)!)) u = k
      if (u === undefined) break
      hecho.add(u)
      const du = ctx.devices.get(u)!
      for (const v of vecinos.get(u) ?? []) {
        const nd = dist.get(u)! + (proto === 'ospf' ? ospfCost(du, v.local) : 1)
        if (dist.has(v.peer) && dist.get(v.peer)! <= nd) continue
        dist.set(v.peer, nd)
        primerSalto.set(v.peer, u === origen ? v : primerSalto.get(u)!)
      }
    }
    const rutas = candidatas.get(origen)!
    for (const [dest, costo] of dist) {
      if (dest === origen) continue
      const fs = primerSalto.get(dest)!
      for (const red of anuncios.get(dest) ?? []) {
        if (rutas.some((r) => r.proto === 'C' && r.network === red.ip && r.prefix === red.prefix)) continue
        // OSPF: costo acumulado + costo de la red en el router que la anuncia; externa E2 = 1
        const metrica = proto === 'ospf' ? (red.external ? 1 : costo + red.cost) : costo
        pushBest(rutas, code, ad, red, metrica, fs, dest)
      }
    }
  }
}

/** EIGRP como vector-distancia: cada router hereda (BW mínimo, Σretardo) del vecino y suma su interfaz de salida. */
function eigrpDistanceVector(ctx: L3Context, part: Map<string, Participation[]>, vecinos: Map<string, Vecino[]>,
  anuncios: Map<string, (Cidr4 & { iface: NIface; external: boolean })[]>, candidatas: Map<string, Route[]>): void {
  interface Entrada { bw: number; delay: number; metric: number; via?: Vecino; origen: string }
  const estado = new Map<string, Map<string, Entrada & Cidr4>>()
  for (const [id] of part) {
    const d = ctx.devices.get(id)!
    const m = new Map<string, Entrada & Cidr4>()
    for (const red of anuncios.get(id) ?? []) {
      if (red.external) continue
      const bw = defaultBandwidth(d, red.iface)
      const delay = eigrpDelay(d, red.iface)
      m.set(`${red.ip}/${red.prefix}`, { ip: red.ip, prefix: red.prefix, bw, delay, metric: eigrpMetric(bw, delay), origen: id })
    }
    estado.set(id, m)
  }
  for (let ronda = 0; ronda <= part.size + 1; ronda++) {
    let cambio = false
    for (const [id] of part) {
      const d = ctx.devices.get(id)!
      const propio = estado.get(id)!
      for (const v of vecinos.get(id) ?? []) {
        for (const [k, e] of estado.get(v.peer)!) {
          if (e.via?.peer === id) continue               // split horizon
          const conectada = propio.get(k)
          if (conectada && !conectada.via) continue
          const bw = Math.min(e.bw, defaultBandwidth(d, v.local))
          const delay = e.delay + eigrpDelay(d, v.local)
          const metric = eigrpMetric(bw, delay)
          if (!conectada || metric < conectada.metric) {
            propio.set(k, { ip: e.ip, prefix: e.prefix, bw, delay, metric, via: v, origen: e.origen })
            cambio = true
          }
        }
      }
    }
    if (!cambio) break
  }
  for (const [id, m] of estado) {
    const rutas = candidatas.get(id)!
    for (const e of m.values()) if (e.via) pushBest(rutas, 'D', AD.D, e, e.metric, e.via, e.origen)
  }
}

function pushBest(rutas: Route[], code: RouteProto, ad: number, red: Cidr4, metrica: number, fs: Vecino, origen: string): void {
  const existente = rutas.find((r) => r.proto.startsWith(code) && r.network === red.ip && r.prefix === red.prefix)
  if (existente && existente.metric <= metrica) return
  if (existente) rutas.splice(rutas.indexOf(existente), 1)
  rutas.push({
    proto: red.prefix === 0 ? (`${code}*` as RouteProto) : code, network: red.ip, prefix: red.prefix, ad, metric: metrica,
    nextHop: fs.remoto.cidr!.ip, iface: fs.local.name, ifaceKey: fs.local.key, learnedFrom: origen,
  })
}

export function routeView(r: Route): RouteView {
  return {
    code: r.proto === 'O*' ? 'O*E2' : r.proto,
    prefix: `${formatIpv4(r.network)}/${r.prefix}`,
    adMetric: r.proto === 'C' || r.proto === 'L' ? '' : `[${r.ad}/${r.metric}]`,
    via: r.nextHop !== undefined ? formatIpv4(r.nextHop) : r.proto === 'C' ? 'directamente conectada' : r.proto === 'L' ? 'local' : '',
    iface: r.iface ?? '',
  }
}
