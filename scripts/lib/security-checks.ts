// Validaciones de firewall ASA y de VPN IPsec site-to-site.

import type { Diagnostic, IpsecTunnel } from './model.ts'
import type { NDevice } from './normalize.ts'
import { findIface } from './normalize.ts'
import type { L3Context } from './l3.ts'
import { lookup } from './l3.ts'
import { isAsa, securityLevel } from './trace.ts'
import { cidrKey, parseCidr4, parseIpv4 } from './ip.ts'

export function checkAsa(devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  for (const d of devices.values()) {
    if (!isAsa(d)) continue
    const nombres = new Map<string, string>()
    for (const i of d.ifaces) {
      if (!i.cidr && !i.dhcp) continue
      const sujeto = { device: d.id, interface: i.name }
      if (!i.nameif) {
        diags.push({ severity: 'error', code: 'ASA-NO-NAMEIF', message: `${d.id} ${i.name}: una interfaz del ASA sin "nameif" no deja pasar tráfico.`, subject: sujeto, hint: 'Agregue "nameif": "inside" | "outside" | "dmz" y "securityLevel".' })
        continue
      }
      if (nombres.has(i.nameif)) diags.push({ severity: 'error', code: 'ASA-NAMEIF-DUP', message: `${d.id}: nameif "${i.nameif}" repetido en ${nombres.get(i.nameif)} y ${i.name}.`, subject: sujeto })
      nombres.set(i.nameif, i.name)
      if (i.securityLevel === undefined) {
        diags.push({ severity: 'info', code: 'ASA-SECURITY-LEVEL-DEFAULT', message: `${d.id} ${i.name}: sin securityLevel; el ASA asume ${securityLevel(i)} (100 si nameif es inside, 0 en otro caso).`, subject: sujeto })
      } else if (i.securityLevel < 0 || i.securityLevel > 100) {
        diags.push({ severity: 'error', code: 'ASA-SECURITY-LEVEL-RANGE', message: `${d.id} ${i.name}: security-level debe estar entre 0 y 100.`, subject: sujeto })
      }
      if (i.nat) diags.push({ severity: 'info', code: 'ASA-NAT-FLAGS', message: `${d.id} ${i.name}: "nat": inside/outside no se usa en ASA; el NAT se define con services.nat (objetos).`, subject: sujeto })
    }
    const nat = d.services?.nat
    if (nat?.overloadInterface) {
      const o = findIface(d, nat.overloadInterface)
      if (!o?.nameif) diags.push({ severity: 'error', code: 'ASA-NAT-IF', message: `${d.id}: la interfaz de PAT ${nat.overloadInterface} no existe o no tiene nameif.`, subject: { device: d.id } })
    }
    for (const a of d.acls ?? []) {
      for (const e of a.entries) {
        if ((e.dstPort ?? '').match(/\b(bootps|bootpc)\b/)) diags.push({ severity: 'info', code: 'ASA-PORT-NAME', message: `${d.id} ACL ${a.name}: verifique el nombre de puerto "${e.dstPort}" en ASA (algunos nombres difieren de IOS; use el número si hay duda).`, subject: { device: d.id } })
      }
    }
    if (!d.firewall?.inspectIcmp) {
      diags.push({ severity: 'info', code: 'ASA-NO-INSPECT-ICMP', message: `${d.id}: sin "firewall.inspectIcmp"; los ping desde dentro hacia afuera no tendrán respuesta (el ASA no inspecciona ICMP por defecto).`, subject: { device: d.id } })
    }
  }
}

function mismasRedes(a: string[], b: string[]): boolean {
  const k = (x: string[]): string => x.map((p) => { const c = parseCidr4(p); return c ? cidrKey(c) : p }).sort().join(',')
  return k(a) === k(b)
}

function ike(t: IpsecTunnel, target: string): string {
  return [t.ike?.encryption ?? 'aes 256', t.ike?.hash ?? 'sha', t.ike?.group ?? (target === 'packet-tracer' ? 5 : 14)].join('|')
}

export function checkVpn(devices: Map<string, NDevice>, ctx: L3Context, target: string, diags: Diagnostic[]): void {
  for (const d of devices.values()) {
    for (const t of d.vpn?.siteToSite ?? []) {
      const sujeto = { device: d.id }
      const pre = `${d.id} VPN ${t.name}`
      if (isAsa(d)) { diags.push({ severity: 'info', code: 'VPN-ASA', message: `${pre}: VPN en ASA no se genera automáticamente (solo IOS crypto map).`, subject: sujeto }); continue }
      const local = findIface(d, t.localInterface)
      if (!local?.cidr) { diags.push({ severity: 'error', code: 'VPN-LOCAL-IF', message: `${pre}: la interfaz ${t.localInterface} no existe o no tiene IP.`, subject: sujeto }); continue }
      for (const p of [...t.localNetworks, ...t.remoteNetworks]) if (!parseCidr4(p)) diags.push({ severity: 'error', code: 'VPN-NETWORK', message: `${pre}: red inválida "${p}".`, subject: sujeto })
      const peerIp = parseIpv4(t.peer)
      if (peerIp === null) { diags.push({ severity: 'error', code: 'VPN-PEER', message: `${pre}: peer inválido "${t.peer}".`, subject: sujeto }); continue }
      const tabla = ctx.tables.get(d.id) ?? []
      if (!lookup(tabla, peerIp)) diags.push({ severity: 'error', code: 'VPN-PEER-UNREACHABLE', message: `${pre}: no hay ruta hacia el peer ${t.peer}.`, subject: sujeto })
      for (const r of t.remoteNetworks) {
        const c = parseCidr4(r)
        const ruta = c ? lookup(tabla, c.ip) : undefined
        if (c && (!ruta || ruta.ifaceKey !== local.key)) {
          diags.push({ severity: 'warning', code: 'VPN-NO-ROUTE', message: `${pre}: el tráfico hacia ${r} no sale por ${local.name} (donde está el crypto map); no se cifrará.`, subject: sujeto, hint: 'Normalmente la ruta por defecto hacia el ISP cubre las redes remotas.' })
        }
      }
      const peer = [...devices.values()].find((x) => x.ifaces.some((i) => i.cidr?.ip === peerIp))
      if (!peer) { diags.push({ severity: 'info', code: 'VPN-PEER-OUTSIDE-MODEL', message: `${pre}: el peer ${t.peer} no está en el modelo; no se verifica el extremo remoto.`, subject: sujeto }); continue }
      const espejo = peer.vpn?.siteToSite.find((x) => parseIpv4(x.peer) === local.cidr!.ip)
      if (!espejo) { diags.push({ severity: 'error', code: 'VPN-NO-MIRROR', message: `${pre}: ${peer.id} no tiene un túnel con peer ${local.cidr ? `la IP de ${d.id} ${local.name}` : d.id}.`, subject: sujeto }); continue }
      if (!mismasRedes(t.localNetworks, espejo.remoteNetworks) || !mismasRedes(t.remoteNetworks, espejo.localNetworks)) {
        diags.push({ severity: 'error', code: 'VPN-ACL-NOT-MIRRORED', message: `${pre}: las redes no son espejo de las de ${peer.id} (${espejo.name}); la fase 2 no se establece.`, subject: sujeto })
      }
      if (t.psk !== espejo.psk) diags.push({ severity: 'error', code: 'VPN-PSK-MISMATCH', message: `${pre}: la clave precompartida no coincide con ${peer.id}.`, subject: sujeto })
      if (ike(t, target) !== ike(espejo, target)) diags.push({ severity: 'error', code: 'VPN-IKE-MISMATCH', message: `${pre}: política IKE (cifrado/hash/grupo DH) distinta a la de ${peer.id}.`, subject: sujeto })
      if ((t.transform ?? 'esp-aes 256 esp-sha-hmac') !== (espejo.transform ?? 'esp-aes 256 esp-sha-hmac')) diags.push({ severity: 'error', code: 'VPN-TRANSFORM-MISMATCH', message: `${pre}: transform-set distinto al de ${peer.id}.`, subject: sujeto })
    }
  }
}
