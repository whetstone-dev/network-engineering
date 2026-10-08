// Trazado de paquetes (ping ida y vuelta) sobre el modelo: LPM, ACL, NAT/PAT (dinámica y estática),
// HSRP, firewall ASA con estado (niveles de seguridad, inspect icmp) y túneles IPsec site-to-site.

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

/** Nivel de seguridad efectivo de una interfaz ASA (por defecto: inside = 100, resto = 0). */
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
    return { permit: e.action === 'permit', rule: `${acl.name} línea ${n} (${e.action})` }
  }
  return { permit: false, rule: `${acl.name} deny implícito` }
}

function ipsOf(d: NDevice, ctx: L3Context): number[] {
  const propias = d.ifaces.filter((i) => i.cidr && ifUp(i)).map((i) => i.cidr!.ip)
  const h = ctx.hostIp.get(d.id)
  if (h) propias.push(h.ip)
  return [...propias, ...activeVips(ctx, d.id)]
}

/** Interfaz "externa" donde aplica NAT: nat outside (IOS) o la de PAT / nameif outside (ASA). */
function esExterna(d: NDevice, i: NIface): boolean {
  if (isAsa(d)) {
    const pat = d.services?.nat?.overloadInterface
    return (pat ? ifKey(pat) === i.key : false) || i.nameif === 'outside'
  }
  return i.nat === 'outside'
}

/** ARP en el dominio L2: IP real, IP DHCP simulada, VIP HSRP activa o IP de NAT estática (proxy-ARP). */
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

/** Camina un paquete desde un dispositivo hasta dst. */
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
    // ACL de entrada (IOS: antes del NAT; el ASA evalúa más abajo con IP reales)
    if (!asa && !desdeTunel && entrada?.acl?.in && src !== undefined) {
      const r = aclPermitsIcmp(est.acls.get(dev.id)?.get(entrada.acl.in), src, dst)
      if (!r.permit) return { ok: false, reason: `Bloqueado por ACL de entrada en ${dev.id} ${entrada.name}: ${r.rule}`, hops, src }
    }
    desdeTunel = false
    // NAT de destino: estática (outside → inside) o respuesta a una traducción dinámica
    if (entrada && esExterna(dev, entrada)) {
      const st = (dev.services?.nat?.static ?? []).find((s) => parseIpv4(s.outside) === dst)
      const din = est.nat.find((e) => e.device === dev.id && e.outside === dst)
      const real = st ? parseIpv4(st.inside) : din?.inside
      if (real !== undefined && real !== null) {
        hop.note = `NAT: destino ${formatIpv4(dst)} → ${formatIpv4(real)}`
        dst = real
      }
    }
    if (ipsOf(dev, ctx).includes(dst)) return { ok: true, reason: 'entregado', hops, src: src!, dstDevice: dev.id }

    let salida: NIface | undefined
    let siguiente: number
    if (esHost) {
      if (entrada) return { ok: false, reason: `${dev.id} no enruta (recibió un paquete que no es para él)`, hops, src: src! }
      const hi = hostIface(dev) ?? dev.ifaces.find((i) => i.mode === 'svi' && i.cidr)
      const datos = ctx.hostIp.get(dev.id) ?? (hi?.cidr ? { ip: hi.cidr.ip, prefix: hi.cidr.prefix, gateway: dev.gateway ? parseIpv4(dev.gateway) ?? undefined : undefined, simulated: false } : undefined)
      if (!hi || !datos) return { ok: false, reason: `${dev.id} no tiene dirección IP`, hops, src: src ?? 0 }
      if (src === undefined) src = datos.ip
      salida = hi
      if (containsIp({ ip: datos.ip, prefix: datos.prefix }, dst)) siguiente = dst
      else if (datos.gateway === undefined) return { ok: false, reason: `${dev.id} no tiene gateway y el destino está en otra red`, hops, src }
      else siguiente = datos.gateway
    } else {
      const r = lookup(ctx.tables.get(dev.id) ?? [], dst)
      if (!r) return { ok: false, reason: `${dev.id} no tiene ruta hacia ${formatIpv4(dst)}`, hops, src: src ?? 0 }
      salida = dev.ifByKey.get(r.ifaceKey!)
      if (!salida) return { ok: false, reason: `${dev.id}: interfaz de salida inválida`, hops, src: src ?? 0 }
      if (src === undefined) src = salida.cidr?.ip ?? 0
      siguiente = r.proto === 'C' ? dst : r.nextHop ?? dst

      // Firewall ASA con estado
      if (asa && entrada) {
        const respuesta = est.conns.has(`${dev.id}|${dst}|${src}`)
        if (respuesta) {
          if (!dev.firewall?.inspectIcmp) return { ok: false, reason: `${dev.id}: la respuesta ICMP se descarta (falta "inspect icmp" en la política global del ASA)`, hops, src }
          hop.note = 'ASA: respuesta permitida por estado (inspect icmp)'
        } else if (entrada.acl?.in) {
          const a = aclPermitsIcmp(est.acls.get(dev.id)?.get(entrada.acl.in), src, dst)
          if (!a.permit) return { ok: false, reason: `Bloqueado por ACL ${entrada.acl.in} en ${dev.id} (${entrada.nameif ?? entrada.name}): ${a.rule}`, hops, src }
        } else {
          const li = securityLevel(entrada)
          const lo = securityLevel(salida)
          const igual = li === lo && dev.firewall?.sameSecurityPermit
          if (!(li > lo || igual)) {
            return { ok: false, reason: `${dev.id}: tráfico de ${entrada.nameif ?? entrada.name} (nivel ${li}) a ${salida.nameif ?? salida.name} (nivel ${lo}) requiere una ACL que lo permita`, hops, src }
          }
        }
        if (!respuesta) est.conns.add(`${dev.id}|${src}|${dst}`)
      }

      // VPN IPsec: el tráfico interesante se encapsula hacia el peer (y no pasa por NAT)
      const tun = (dev.vpn?.siteToSite ?? []).find((t) => ifKey(t.localInterface) === salida!.key && enRedes(t.localNetworks, src!) && enRedes(t.remoteNetworks, dst))
      if (tun) {
        hop.out = salida.name
        const peerIp = parseIpv4(tun.peer)
        const peer = peerIp === null ? undefined : [...ctx.devices.values()].find((d) => d.ifaces.some((i) => i.cidr?.ip === peerIp))
        const localIp = salida.cidr?.ip
        const espejo = peer?.vpn?.siteToSite.find((t) => parseIpv4(t.peer) === localIp)
        if (!peer || !espejo) return { ok: false, reason: `VPN ${tun.name}: el peer ${tun.peer} no tiene un túnel espejo hacia ${localIp !== undefined ? formatIpv4(localIp) : dev.id}`, hops, src }
        if (profundidad > 2) return { ok: false, reason: 'VPN: túneles anidados no soportados en la simulación', hops, src }
        const underlay = walk(ctx, { ...est, nat: [], conns: new Set() }, dev, localIp, peerIp!, profundidad + 1)
        if (underlay.ok !== true) return { ok: false, reason: `VPN ${tun.name}: el peer ${tun.peer} no es alcanzable por la red de transporte (${underlay.reason})`, hops, src }
        hop.note = `IPsec ${tun.name}: cifrado hacia ${peer.id} (${tun.peer})`
        const entradaPeer = findIface(peer, espejo.localInterface)
        if (!entradaPeer) return { ok: false, reason: `VPN: ${peer.id} no tiene la interfaz ${espejo.localInterface}`, hops, src }
        dev = peer
        entrada = entradaPeer
        desdeTunel = true
        continue
      }

      // NAT de origen inside → outside
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
          hop.note = `${hop.note ? hop.note + ' · ' : ''}NAT: origen ${formatIpv4(src)} → ${formatIpv4(nueva)}`
          src = nueva
        }
      }
    }
    hop.out = salida.name
    if (!asa && salida.acl?.out) {
      const r = aclPermitsIcmp(est.acls.get(dev.id)?.get(salida.acl.out), src, dst)
      if (!r.permit) return { ok: false, reason: `Bloqueado por ACL de salida en ${dev.id} ${salida.name}: ${r.rule}`, hops, src }
    }
    const vecino = arp(ctx, salida, siguiente)
    if (!vecino) {
      const existe = [...ctx.devices.values()].some((d) => ipsOf(d, ctx).includes(siguiente))
      if (!existe && siguiente === dst) return { ok: null, reason: `${formatIpv4(dst)} está fuera del modelo; el paquete sale por ${dev.id} ${salida.name}`, hops, src }
      return { ok: false, reason: `${dev.id} no alcanza ${formatIpv4(siguiente)} por ${salida.name} (no está en el mismo dominio L2: revise VLAN, trunk o cableado)`, hops, src }
    }
    dev = ctx.devices.get(vecino.deviceId)!
    entrada = vecino
  }
  return { ok: false, reason: 'TTL agotado (posible bucle de routing)', hops, src: src ?? 0 }
}

export function tracePing(ctx: L3Context, _model: NetworkModel, fromId: string, to: string): TraceResult {
  const base: TraceResult = { from: fromId, to, status: 'fail', reason: '', forward: [], reverse: [] }
  const origen = ctx.devices.get(fromId)
  if (!origen) return { ...base, reason: `No existe el dispositivo ${fromId}` }
  let dst = parseIpv4(to)
  if (dst === null) {
    const d = ctx.devices.get(to)
    if (!d) return { ...base, reason: `Destino "${to}" no es una IP ni un dispositivo` }
    const ips = ipsOf(d, ctx)
    if (!ips.length) return { ...base, reason: `${to} no tiene IP` }
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
  if (vuelta.ok === true && vuelta.dstDevice === fromId) return { ...base, status: 'success', reason: 'Ida y vuelta correctas' }
  return { ...base, status: vuelta.ok === null ? 'unknown' : 'fail', reason: `Retorno: ${vuelta.reason}` }
}
