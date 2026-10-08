// Packet tracing (round-trip ping) over the model: LPM, ACL, NAT/PAT (dynamic and static),
// HSRP, stateful ASA firewall (security levels, inspect icmp) and site-to-site IPsec tunnels.

import type { Acl, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { NDevice, NIface } from './normalize.ts'
import { findIface, ifUp } from './normalize.ts'
import type { L3Context } from './l3.ts'
import { activeVips, lookup, routesDevice, segOf } from './l3.ts'
import { aclMatches, containsIp, formatIpv4, parseAclAddress, parseCidr4, parseIpv4 } from './ip.ts'
import { ifKey } from './names.ts'
import { lookupModel } from './catalog.ts'

export interface Hop { device: string; in?: string; out?: string; note?: string }
export interface TraceResult {
  from: string
  to: string
  status: 'success' | 'fail' | 'unknown'
  reason: string
  forward: Hop[]
  reverse: Hop[]
}

interface NatEntry { device: string; inside: number; outside: number }
interface Estado { acls: Map<string, Map<string, Acl>>; nat: NatEntry[]; conns: Set<string> }

export function isAsa(d: NDevice): boolean {
  return d.platform === 'asa' || (d.type === 'firewall' && (lookupModel(d.model)?.platform ?? 'asa') === 'asa')
}

/** Effective security level of an ASA interface (default: inside = 100, others = 0). */
export function securityLevel(i: NIface): number {
  return i.securityLevel ?? (i.nameif === 'inside' ? 100 : 0)
}

function aclPermitsIcmp(acl: Acl | undefined, src: number, dst: number): { permit: boolean; rule: string } {
  if (!acl) return { permit: true, rule: '' }
  let n = 0
  for (const e of acl.entries) {
    if (e.action === 'remark') continue
    n++
    const proto = (e.protocol ?? 'ip').toLowerCase()
    if (acl.type === 'extended' && proto !== 'ip' && proto !== 'icmp') continue
    const s = parseAclAddress(e.src)
    if (!s || !aclMatches(s, src)) continue
    if (acl.type === 'extended') {
      const d = parseAclAddress(e.dst)
      if (!d || !aclMatches(d, dst)) continue
    }
    return { permit: e.action === 'permit', rule: `${acl.name} line ${n} (${e.action})` }
  }
  return { permit: false, rule: `${acl.name} implicit deny` }
}

function ipsOf(d: NDevice, ctx: L3Context): number[] {
  const propias = d.ifaces.filter((i) => i.cidr && ifUp(i)).map((i) => i.cidr!.ip)
  const h = ctx.hostIp.get(d.id)
  if (h) propias.push(h.ip)
  return [...propias, ...activeVips(ctx, d.id)]
}

/** "External" interface where NAT applies: nat outside (IOS), or the PAT / nameif outside interface (ASA). */
function esExterna(d: NDevice, i: NIface): boolean {
  if (isAsa(d)) {
    const pat = d.services?.nat?.overloadInterface
    return (pat ? ifKey(pat) === i.key : false) || i.nameif === 'outside'
  }
  return i.nat === 'outside'
}

/** ARP in the L2 domain: real IP, simulated DHCP IP, active HSRP VIP or static NAT IP (proxy-ARP). */
function arp(ctx: L3Context, desde: NIface, ip: number): NIface | undefined {
  const s = segOf(ctx, desde)
  if (!s) return undefined
  const directo = s.ifaces.find((i) => {
    if (i === desde) return false
    if (i.cidr?.ip === ip && ifUp(i)) return true
    const h = ctx.hostIp.get(i.deviceId)
    return !!h && h.simulated && h.ip === ip && i.mode === 'host'
  })
  if (directo) return directo
  const vip = ctx.hsrpActive.get(s)?.get(ip)
  if (vip && vip !== desde) return vip
  return s.ifaces.find((i) => {
    if (i === desde || !i.cidr || !containsIp(i.cidr, ip)) return false
    const d = ctx.devices.get(i.deviceId)!
    return esExterna(d, i) && (d.services?.nat?.static ?? []).some((st) => parseIpv4(st.outside) === ip)
  })
}

function hostIface(d: NDevice): NIface | undefined {
  return d.ifaces.find((i) => i.mode === 'host' && ifUp(i)) ?? d.ifaces.find((i) => i.mode === 'host')
}

function enRedes(redes: string[], ip: number): boolean {
  return redes.some((p) => { const c = parseCidr4(p); return !!c && containsIp(c, ip) })
}

interface Paso { ok: boolean | null; reason: string; hops: Hop[]; src: number; dstDevice?: string }

/** Walks a packet from a device to dst. */
function walk(ctx: L3Context, est: Estado, inicio: NDevice, srcIn: number | undefined, dst: number, profundidad = 0): Paso {
  const hops: Hop[] = []
  let src = srcIn
  let dev = inicio
  let entrada: NIface | undefined
  let desdeTunel = false
  for (let ttl = 0; ttl < 32; ttl++) {
    const hop: Hop = { device: dev.id, in: entrada?.name }
    hops.push(hop)
    const esHost = HOST_TYPES.has(dev.type) || !routesDevice(dev)
    const asa = isAsa(dev)
    // Inbound ACL (IOS: before NAT; the ASA evaluates it further below with real IPs)
    if (!asa && !desdeTunel && entrada?.acl?.in && src !== undefined) {
      const r = aclPermitsIcmp(est.acls.get(dev.id)?.get(entrada.acl.in), src, dst)
      if (!r.permit) return { ok: false, reason: `Blocked by inbound ACL on ${dev.id} ${entrada.name}: ${r.rule}`, hops, src }
    }
    desdeTunel = false
    // Destination NAT: static (outside → inside) or reply to a dynamic translation
    if (entrada && esExterna(dev, entrada)) {
      const st = (dev.services?.nat?.static ?? []).find((s) => parseIpv4(s.outside) === dst)
      const din = est.nat.find((e) => e.device === dev.id && e.outside === dst)
      const real = st ? parseIpv4(st.inside) : din?.inside
      if (real !== undefined && real !== null) {
        hop.note = `NAT: destination ${formatIpv4(dst)} → ${formatIpv4(real)}`
        dst = real
      }
    }
    if (ipsOf(dev, ctx).includes(dst)) return { ok: true, reason: 'delivered', hops, src: src!, dstDevice: dev.id }

    let salida: NIface | undefined
    let siguiente: number
    if (esHost) {
      if (entrada) return { ok: false, reason: `${dev.id} does not route (it received a packet not addressed to it)`, hops, src: src! }
      const hi = hostIface(dev) ?? dev.ifaces.find((i) => i.mode === 'svi' && i.cidr)
      const datos = ctx.hostIp.get(dev.id) ?? (hi?.cidr ? { ip: hi.cidr.ip, prefix: hi.cidr.prefix, gateway: dev.gateway ? parseIpv4(dev.gateway) ?? undefined : undefined, simulated: false } : undefined)
      if (!hi || !datos) return { ok: false, reason: `${dev.id} has no IP address`, hops, src: src ?? 0 }
      if (src === undefined) src = datos.ip
      salida = hi
      if (containsIp({ ip: datos.ip, prefix: datos.prefix }, dst)) siguiente = dst
      else if (datos.gateway === undefined) return { ok: false, reason: `${dev.id} has no gateway and the destination is on another network`, hops, src }
      else siguiente = datos.gateway
    } else {
      const r = lookup(ctx.tables.get(dev.id) ?? [], dst)
      if (!r) return { ok: false, reason: `${dev.id} has no route to ${formatIpv4(dst)}`, hops, src: src ?? 0 }
      salida = dev.ifByKey.get(r.ifaceKey!)
      if (!salida) return { ok: false, reason: `${dev.id}: invalid exit interface`, hops, src: src ?? 0 }
      if (src === undefined) src = salida.cidr?.ip ?? 0
      siguiente = r.proto === 'C' ? dst : r.nextHop ?? dst

      // Stateful ASA firewall
      if (asa && entrada) {
        const respuesta = est.conns.has(`${dev.id}|${dst}|${src}`)
        if (respuesta) {
          if (!dev.firewall?.inspectIcmp) return { ok: false, reason: `${dev.id}: the ICMP reply is dropped (missing "inspect icmp" in the ASA global policy)`, hops, src }
          hop.note = 'ASA: reply permitted by connection state (inspect icmp)'
        } else if (entrada.acl?.in) {
          const a = aclPermitsIcmp(est.acls.get(dev.id)?.get(entrada.acl.in), src, dst)
          if (!a.permit) return { ok: false, reason: `Blocked by ACL ${entrada.acl.in} on ${dev.id} (${entrada.nameif ?? entrada.name}): ${a.rule}`, hops, src }
        } else {
          const li = securityLevel(entrada)
          const lo = securityLevel(salida)
          const igual = li === lo && dev.firewall?.sameSecurityPermit
          if (!(li > lo || igual)) {
            return { ok: false, reason: `${dev.id}: traffic from ${entrada.nameif ?? entrada.name} (level ${li}) to ${salida.nameif ?? salida.name} (level ${lo}) requires an ACL that permits it`, hops, src }
          }
        }
        if (!respuesta) est.conns.add(`${dev.id}|${src}|${dst}`)
      }

      // IPsec VPN: interesting traffic is encapsulated toward the peer (and bypasses NAT)
      const tun = (dev.vpn?.siteToSite ?? []).find((t) => ifKey(t.localInterface) === salida!.key && enRedes(t.localNetworks, src!) && enRedes(t.remoteNetworks, dst))
      if (tun) {
        hop.out = salida.name
        const peerIp = parseIpv4(tun.peer)
        const peer = peerIp === null ? undefined : [...ctx.devices.values()].find((d) => d.ifaces.some((i) => i.cidr?.ip === peerIp))
        const localIp = salida.cidr?.ip
        const espejo = peer?.vpn?.siteToSite.find((t) => parseIpv4(t.peer) === localIp)
        if (!peer || !espejo) return { ok: false, reason: `VPN ${tun.name}: peer ${tun.peer} has no mirror tunnel toward ${localIp !== undefined ? formatIpv4(localIp) : dev.id}`, hops, src }
        if (profundidad > 2) return { ok: false, reason: 'VPN: nested tunnels are not supported in the simulation', hops, src }
        const underlay = walk(ctx, { ...est, nat: [], conns: new Set() }, dev, localIp, peerIp!, profundidad + 1)
        if (underlay.ok !== true) return { ok: false, reason: `VPN ${tun.name}: peer ${tun.peer} is not reachable over the transport network (${underlay.reason})`, hops, src }
        hop.note = `IPsec ${tun.name}: encrypted toward ${peer.id} (${tun.peer})`
        const entradaPeer = findIface(peer, espejo.localInterface)
        if (!entradaPeer) return { ok: false, reason: `VPN: ${peer.id} does not have interface ${espejo.localInterface}`, hops, src }
        dev = peer
        entrada = entradaPeer
        desdeTunel = true
        continue
      }

      // Source NAT inside → outside
      const haciaFuera = asa ? !!entrada && esExterna(dev, salida) && !esExterna(dev, entrada) : entrada?.nat === 'inside' && salida.nat === 'outside'
      if (haciaFuera) {
        const cfg = dev.services?.nat
        const estatica = cfg?.static?.find((s) => parseIpv4(s.inside) === src)
        const coincide = enRedes(cfg?.insideSources ?? [], src)
        let nueva: number | undefined
        if (estatica) nueva = parseIpv4(estatica.outside) ?? undefined
        else if (coincide && cfg?.overloadInterface) nueva = findIface(dev, cfg.overloadInterface)?.cidr?.ip
        else if (coincide && cfg?.pool) nueva = parseIpv4(cfg.pool.start) ?? undefined
        if (nueva !== undefined) {
          est.nat.push({ device: dev.id, inside: src, outside: nueva })
          hop.note = `${hop.note ? hop.note + ' · ' : ''}NAT: source ${formatIpv4(src)} → ${formatIpv4(nueva)}`
          src = nueva
        }
      }
    }
    hop.out = salida.name
    if (!asa && salida.acl?.out) {
      const r = aclPermitsIcmp(est.acls.get(dev.id)?.get(salida.acl.out), src, dst)
      if (!r.permit) return { ok: false, reason: `Blocked by outbound ACL on ${dev.id} ${salida.name}: ${r.rule}`, hops, src }
    }
    const vecino = arp(ctx, salida, siguiente)
    if (!vecino) {
      const existe = [...ctx.devices.values()].some((d) => ipsOf(d, ctx).includes(siguiente))
      if (!existe && siguiente === dst) return { ok: null, reason: `${formatIpv4(dst)} is outside the model; the packet exits via ${dev.id} ${salida.name}`, hops, src }
      return { ok: false, reason: `${dev.id} cannot reach ${formatIpv4(siguiente)} via ${salida.name} (not in the same L2 domain: check VLAN, trunk or cabling)`, hops, src }
    }
    dev = ctx.devices.get(vecino.deviceId)!
    entrada = vecino
  }
  return { ok: false, reason: 'TTL expired (possible routing loop)', hops, src: src ?? 0 }
}

export function tracePing(ctx: L3Context, _model: NetworkModel, fromId: string, to: string): TraceResult {
  const base: TraceResult = { from: fromId, to, status: 'fail', reason: '', forward: [], reverse: [] }
  const origen = ctx.devices.get(fromId)
  if (!origen) return { ...base, reason: `Device ${fromId} does not exist` }
  let dst = parseIpv4(to)
  if (dst === null) {
    const d = ctx.devices.get(to)
    if (!d) return { ...base, reason: `Destination "${to}" is neither an IP address nor a device` }
    const ips = ipsOf(d, ctx)
    if (!ips.length) return { ...base, reason: `${to} has no IP address` }
    dst = ips[0]
  }
  const est: Estado = { acls: new Map(), nat: [], conns: new Set() }
  for (const d of ctx.devices.values()) est.acls.set(d.id, new Map((d.acls ?? []).map((a) => [a.name, a])))
  const ida = walk(ctx, est, origen, undefined, dst)
  base.forward = ida.hops
  if (ida.ok !== true) return { ...base, status: ida.ok === null ? 'unknown' : 'fail', reason: ida.reason }
  const destino = ctx.devices.get(ida.dstDevice!)!
  const vuelta = walk(ctx, est, destino, dst, ida.src)
  base.reverse = vuelta.hops
  if (vuelta.ok === true && vuelta.dstDevice === fromId) return { ...base, status: 'success', reason: 'Round trip OK' }
  return { ...base, status: vuelta.ok === null ? 'unknown' : 'fail', reason: `Return: ${vuelta.reason}` }
}
