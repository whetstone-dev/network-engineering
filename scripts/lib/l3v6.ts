// Capa 3 IPv6: validación de direccionamiento y tablas simuladas (conectadas, estáticas, OSPFv3).

import type { Diagnostic } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { NDevice, NIface } from './normalize.ts'
import { findIface, ifUp } from './normalize.ts'
import type { Segment } from './l2.ts'
import type { L3Context } from './l3.ts'
import { ospfCost, routesDevice, segOf } from './l3.ts'
import type { Cidr6 } from './ip.ts'
import { contains6, formatIpv6, network6, parseCidr6, parseIpv6 } from './ip.ts'
import { ifKey } from './names.ts'

export interface Route6 {
  proto: 'C' | 'L' | 'S' | 'O' | 'OE2'
  network: bigint
  prefix: number
  ad: number
  metric: number
  nextHop?: string
  iface?: string
  ifaceKey?: string
}

export interface Route6View { code: string; prefix: string; adMetric: string; via: string; iface: string }

const LINK_LOCAL: Cidr6 = { ip: parseIpv6('fe80::')!, prefix: 10 }

function addrs(i: NIface): Cidr6[] {
  return (i.ipv6 ?? []).map((t) => parseCidr6(t)).filter((x): x is Cidr6 => !!x)
}

function v6Up(d: NDevice, i: NIface): boolean {
  if (!ifUp(i)) return false
  if (i.parentKey) {
    const p = d.ifByKey.get(i.parentKey)
    if (p && !ifUp(p)) return false
  }
  return addrs(i).length > 0 || !!i.linkLocal
}

function routerId(d: NDevice): string | undefined {
  const r = d.routing
  if (r?.ospfv3?.routerId) return r.ospfv3.routerId
  if (r?.ospf?.routerId) return r.ospf.routerId
  const ips = d.ifaces.filter((i) => i.cidr).map((i) => i.cidr!.ip).sort((a, b) => b - a)
  return ips.length ? [ips[0] >>> 24, (ips[0] >>> 16) & 255, (ips[0] >>> 8) & 255, ips[0] & 255].join('.') : undefined
}

/** Validaciones de direccionamiento IPv6 y gateways IPv6 de hosts. */
export function checkIpv6(ctx: L3Context, diags: Diagnostic[]): void {
  const vistos = new Map<string, string>()
  const prefijosSeg = new Map<Segment, Map<string, string>>()
  for (const d of ctx.devices.values()) {
    for (const i of d.ifaces) {
      const sujeto = { device: d.id, interface: i.name }
      for (const t of i.ipv6 ?? []) {
        const c = parseCidr6(t)
        if (!c) { diags.push({ severity: 'error', code: 'IPV6-INVALID', message: `${d.id} ${i.name}: dirección IPv6 inválida "${t}" (formato 2001:db8::1/64).`, subject: sujeto }); continue }
        const k = formatIpv6(c.ip)
        if (vistos.has(k)) diags.push({ severity: 'error', code: 'IPV6-DUP', message: `IPv6 duplicada ${k}: ${vistos.get(k)} y ${d.id} ${i.name}.`, subject: sujeto })
        vistos.set(k, `${d.id} ${i.name}`)
        if (c.prefix !== 64 && c.prefix !== 127 && c.prefix !== 128 && i.mode !== 'loopback') {
          diags.push({ severity: 'info', code: 'IPV6-PREFIX-LEN', message: `${d.id} ${i.name}: prefijo /${c.prefix}; en LAN se recomienda /64 (SLAAC lo exige) y /127 o /64 en enlaces P2P.`, subject: sujeto })
        }
        const seg = segOf(ctx, i)
        if (seg && i.mode !== 'loopback') {
          if (!prefijosSeg.has(seg)) prefijosSeg.set(seg, new Map())
          prefijosSeg.get(seg)!.set(`${formatIpv6(network6(c))}/${c.prefix}`, `${d.id} ${i.name}`)
        }
      }
      if (i.linkLocal) {
        const ll = parseIpv6(i.linkLocal)
        if (ll === null || !contains6(LINK_LOCAL, ll)) diags.push({ severity: 'error', code: 'IPV6-LINK-LOCAL', message: `${d.id} ${i.name}: "${i.linkLocal}" no es una dirección link-local (fe80::/10).`, subject: sujeto })
      }
    }
    if (d.type === 'switch' && d.ifaces.some((i) => i.ipv6?.length)) {
      diags.push({ severity: 'info', code: 'IPV6-SDM-2960', message: `${d.id}: en un 2960 la SVI con IPv6 requiere "sdm prefer dual-ipv4-and-ipv6 default" y reload [PT].`, subject: { device: d.id } })
    }
  }
  for (const pref of prefijosSeg.values()) {
    if (pref.size > 1) diags.push({ severity: 'error', code: 'IPV6-SEGMENT-PREFIX-MISMATCH', message: `Prefijos IPv6 distintos en el mismo dominio L2: ${[...pref].map(([p, q]) => `${q} (${p})`).join('; ')}.` })
  }
  // gateway IPv6 de hosts
  for (const d of ctx.devices.values()) {
    if (!HOST_TYPES.has(d.type) || !d.ipv6Gateway) continue
    const gw = parseIpv6(d.ipv6Gateway)
    const hi = d.ifaces.find((i) => i.mode === 'host')
    if (gw === null || !hi) { diags.push({ severity: 'error', code: 'IPV6-GW-INVALID', message: `${d.id}: gateway IPv6 inválido "${d.ipv6Gateway}".`, subject: { device: d.id } }); continue }
    const seg = segOf(ctx, hi)
    const ok = seg?.ifaces.some((x) => x.deviceId !== d.id && ((x.linkLocal && parseIpv6(x.linkLocal) === gw) || addrs(x).some((c) => c.ip === gw)))
    if (!ok) diags.push({ severity: 'error', code: 'IPV6-GW-UNREACHABLE', message: `${d.id}: ninguna interfaz de router en su dominio L2 tiene la dirección del gateway IPv6 ${d.ipv6Gateway}.`, subject: { device: d.id }, hint: 'Use la link-local fija del router (p. ej. fe80::1) o su dirección global en esa red.' })
  }
}

function lookup6(tabla: Route6[], ip: bigint): Route6 | undefined {
  let mejor: Route6 | undefined
  for (const r of tabla) {
    if (r.proto === 'L') continue
    if (!contains6({ ip: r.network, prefix: r.prefix }, ip)) continue
    if (!mejor || r.prefix > mejor.prefix || (r.prefix === mejor.prefix && r.ad < mejor.ad)) mejor = r
  }
  return mejor
}

/** Tablas de routing IPv6 de los equipos L3 con IPv6. */
export function buildRoute6Tables(ctx: L3Context, diags: Diagnostic[]): Map<string, Route6[]> {
  const tablas = new Map<string, Route6[]>()
  const enrutadores = [...ctx.devices.values()].filter((d) => routesDevice(d) && d.ifaces.some((i) => v6Up(d, i)))
  for (const d of enrutadores) {
    const rutas: Route6[] = []
    for (const i of d.ifaces) {
      if (!v6Up(d, i)) continue
      for (const c of addrs(i)) {
        rutas.push({ proto: 'C', network: network6(c), prefix: c.prefix, ad: 0, metric: 0, iface: i.name, ifaceKey: i.key })
        rutas.push({ proto: 'L', network: c.ip, prefix: 128, ad: 0, metric: 0, iface: i.name, ifaceKey: i.key })
      }
    }
    for (const s of d.routing?.ipv6Static ?? []) {
      const p = parseCidr6(s.prefix)
      if (!p) { diags.push({ severity: 'error', code: 'IPV6-STATIC-INVALID', message: `${d.id}: ruta IPv6 con prefijo inválido "${s.prefix}".`, subject: { device: d.id } }); continue }
      const nh = s.nextHop ? parseIpv6(s.nextHop) : null
      if (s.nextHop && nh === null) { diags.push({ severity: 'error', code: 'IPV6-STATIC-INVALID', message: `${d.id}: next-hop IPv6 inválido "${s.nextHop}".`, subject: { device: d.id } }); continue }
      let salida = s.exitInterface ? findIface(d, s.exitInterface) : undefined
      if (nh !== null && contains6(LINK_LOCAL, nh) && !salida) {
        diags.push({ severity: 'error', code: 'IPV6-STATIC-LL-NO-IF', message: `${d.id}: la ruta ${s.prefix} usa un next-hop link-local (${s.nextHop}); IOS exige también la interfaz de salida.`, subject: { device: d.id } })
        continue
      }
      if (!salida && nh !== null) {
        const con = lookup6(rutas.filter((r) => r.proto === 'C'), nh)
        if (con) salida = d.ifByKey.get(con.ifaceKey!)
      }
      if (!salida) { diags.push({ severity: 'warning', code: 'IPV6-STATIC-UNRESOLVED', message: `${d.id}: no se resuelve la salida de la ruta IPv6 ${s.prefix}.`, subject: { device: d.id } }); continue }
      rutas.push({ proto: 'S', network: network6(p), prefix: p.prefix, ad: 1, metric: 0, nextHop: s.nextHop, iface: salida.name, ifaceKey: salida.key })
    }
    tablas.set(d.id, rutas)
  }

  // OSPFv3
  const part = new Map<string, { iface: NIface; area: string; passive: boolean }[]>()
  const rids = new Map<string, string>()
  for (const d of enrutadores) {
    const pasivas = new Set((d.routing?.ospfv3?.passiveInterfaces ?? []).map(ifKey))
    const ps = d.ifaces.filter((i) => i.ospfv3 && v6Up(d, i)).map((i) => ({ iface: i, area: String(i.ospfv3!.area), passive: pasivas.has(i.key) || !!i.ospfv3!.passive }))
    if (d.routing?.ospfv3 && !ps.length) diags.push({ severity: 'warning', code: 'OSPFV3-NO-INTERFACES', message: `${d.id}: OSPFv3 configurado pero ninguna interfaz tiene "ospfv3": { "area": ... }.`, subject: { device: d.id } })
    if (!ps.length) continue
    const rid = routerId(d)
    if (!rid) { diags.push({ severity: 'error', code: 'OSPFV3-NO-RID', message: `${d.id}: OSPFv3 necesita router-id (el equipo no tiene IPv4 para elegirlo).`, subject: { device: d.id }, hint: 'Agregue "routing.ospfv3.routerId": "1.1.1.1".' }); continue }
    if (rids.has(rid)) diags.push({ severity: 'error', code: 'OSPFV3-RID-DUP', message: `Router-ID OSPFv3 ${rid} duplicado en ${rids.get(rid)} y ${d.id}.`, subject: { device: d.id } })
    rids.set(rid, d.id)
    part.set(d.id, ps)
  }
  const vecinos = new Map<string, { peer: string; local: NIface; remoto: NIface }[]>()
  for (const id of part.keys()) vecinos.set(id, [])
  const lista = [...part].flatMap(([id, ps]) => ps.map((p) => ({ id, ...p })))
  for (let x = 0; x < lista.length; x++) {
    for (let y = x + 1; y < lista.length; y++) {
      const A = lista[x]
      const B = lista[y]
      if (A.id === B.id || segOf(ctx, A.iface) !== segOf(ctx, B.iface) || !segOf(ctx, A.iface)) continue
      if (A.passive && B.passive) continue
      if (A.passive || B.passive) {
        const p = A.passive ? A : B
        diags.push({ severity: 'error', code: 'OSPFV3-PASSIVE-NEIGHBOR', message: `${p.id} ${p.iface.name} es pasiva en OSPFv3 y hay otro router en el enlace; no se forma adyacencia.`, subject: { device: p.id } })
        continue
      }
      if (A.area !== B.area) {
        diags.push({ severity: 'error', code: 'OSPFV3-AREA-MISMATCH', message: `OSPFv3: ${A.id} ${A.iface.name} (área ${A.area}) y ${B.id} ${B.iface.name} (área ${B.area}) no forman adyacencia.`, subject: { device: A.id } })
        continue
      }
      vecinos.get(A.id)!.push({ peer: B.id, local: A.iface, remoto: B.iface })
      vecinos.get(B.id)!.push({ peer: A.id, local: B.iface, remoto: A.iface })
    }
  }
  for (const [id, ps] of part) {
    const d = ctx.devices.get(id)!
    for (const i of d.ifaces) {
      if (!v6Up(d, i) || ps.some((p) => p.iface === i)) continue
      const otro = segOf(ctx, i)?.ifaces.find((x) => x.deviceId !== id && part.get(x.deviceId)?.some((p) => p.iface === x && !p.passive))
      if (otro) diags.push({ severity: 'error', code: 'OSPFV3-NO-ADJACENCY', message: `${id} ${i.name} no participa en OSPFv3, pero ${otro.deviceId} ${otro.name} sí: no se forma adyacencia.`, subject: { device: id, interface: i.name } })
    }
  }
  const costo = (d: NDevice, i: NIface): number => ospfCost(d, i, i.ospfv3?.cost)
  for (const origen of part.keys()) {
    const dist = new Map<string, number>([[origen, 0]])
    const primer = new Map<string, { local: NIface; remoto: NIface; peer: string }>()
    const hecho = new Set<string>()
    while (true) {
      let u: string | undefined
      for (const [k, v] of dist) if (!hecho.has(k) && (u === undefined || v < dist.get(u)!)) u = k
      if (u === undefined) break
      hecho.add(u)
      const du = ctx.devices.get(u)!
      for (const v of vecinos.get(u) ?? []) {
        const nd = dist.get(u)! + costo(du, v.local)
        if (dist.has(v.peer) && dist.get(v.peer)! <= nd) continue
        dist.set(v.peer, nd)
        primer.set(v.peer, u === origen ? v : primer.get(u)!)
      }
    }
    const rutas = tablas.get(origen)!
    for (const [dest, c] of dist) {
      if (dest === origen) continue
      const fs = primer.get(dest)!
      const dd = ctx.devices.get(dest)!
      const nh = fs.remoto.linkLocal ?? `link-local de ${fs.peer} ${fs.remoto.name}`
      const redes: { net: bigint; prefix: number; metric: number; ext: boolean }[] = []
      for (const p of part.get(dest)!) for (const a of addrs(p.iface)) redes.push({ net: network6(a), prefix: a.prefix, metric: c + costo(dd, p.iface), ext: false })
      if (dd.routing?.ospfv3?.defaultOriginate && (tablas.get(dest) ?? []).some((r) => r.proto === 'S' && r.prefix === 0)) redes.push({ net: 0n, prefix: 0, metric: 1, ext: true })
      for (const r of redes) {
        if (rutas.some((x) => (x.proto === 'C' || x.proto === 'S') && x.network === r.net && x.prefix === r.prefix)) continue
        const prev = rutas.find((x) => (x.proto === 'O' || x.proto === 'OE2') && x.network === r.net && x.prefix === r.prefix)
        if (prev && prev.metric <= r.metric) continue
        if (prev) rutas.splice(rutas.indexOf(prev), 1)
        rutas.push({ proto: r.ext ? 'OE2' : 'O', network: r.net, prefix: r.prefix, ad: 110, metric: r.metric, nextHop: nh, iface: fs.local.name, ifaceKey: fs.local.key })
      }
    }
  }
  for (const [id, t] of tablas) tablas.set(id, t.sort((a, b) => (a.network < b.network ? -1 : a.network > b.network ? 1 : a.prefix - b.prefix)))
  return tablas
}

export function route6View(r: Route6): Route6View {
  return {
    code: r.proto,
    prefix: `${formatIpv6(r.network)}/${r.prefix}`,
    adMetric: r.proto === 'C' || r.proto === 'L' ? '' : `[${r.ad}/${r.metric}]`,
    via: r.nextHop ?? (r.proto === 'C' ? 'directamente conectada' : r.proto === 'L' ? 'local' : ''),
    iface: r.iface ?? '',
  }
}
