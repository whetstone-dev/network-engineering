// ASA firewall and site-to-site IPsec VPN checks.

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
        diags.push({ severity: 'error', code: 'ASA-NO-NAMEIF', message: `${d.id} ${i.name}: an ASA interface without "nameif" does not pass traffic.`, subject: sujeto, hint: 'Add "nameif": "inside" | "outside" | "dmz" and "securityLevel".' })
        continue
      }
      if (nombres.has(i.nameif)) diags.push({ severity: 'error', code: 'ASA-NAMEIF-DUP', message: `${d.id}: nameif "${i.nameif}" repeated on ${nombres.get(i.nameif)} and ${i.name}.`, subject: sujeto })
      nombres.set(i.nameif, i.name)
      if (i.securityLevel === undefined) {
        diags.push({ severity: 'info', code: 'ASA-SECURITY-LEVEL-DEFAULT', message: `${d.id} ${i.name}: no securityLevel; the ASA assumes ${securityLevel(i)} (100 if nameif is inside, 0 otherwise).`, subject: sujeto })
      } else if (i.securityLevel < 0 || i.securityLevel > 100) {
        diags.push({ severity: 'error', code: 'ASA-SECURITY-LEVEL-RANGE', message: `${d.id} ${i.name}: security-level must be between 0 and 100.`, subject: sujeto })
      }
      if (i.nat) diags.push({ severity: 'info', code: 'ASA-NAT-FLAGS', message: `${d.id} ${i.name}: "nat": inside/outside is not used on the ASA; NAT is defined with services.nat (objects).`, subject: sujeto })
    }
    const nat = d.services?.nat
    if (nat?.overloadInterface) {
      const o = findIface(d, nat.overloadInterface)
      if (!o?.nameif) diags.push({ severity: 'error', code: 'ASA-NAT-IF', message: `${d.id}: PAT interface ${nat.overloadInterface} does not exist or has no nameif.`, subject: { device: d.id } })
    }
    for (const a of d.acls ?? []) {
      for (const e of a.entries) {
        if ((e.dstPort ?? '').match(/\b(bootps|bootpc)\b/)) diags.push({ severity: 'info', code: 'ASA-PORT-NAME', message: `${d.id} ACL ${a.name}: verify the port name "${e.dstPort}" on the ASA (some names differ from IOS; use the number if in doubt).`, subject: { device: d.id } })
      }
    }
    if (!d.firewall?.inspectIcmp) {
      diags.push({ severity: 'info', code: 'ASA-NO-INSPECT-ICMP', message: `${d.id}: no "firewall.inspectIcmp"; pings from inside to outside will get no reply (the ASA does not inspect ICMP by default).`, subject: { device: d.id } })
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
      if (isAsa(d)) { diags.push({ severity: 'info', code: 'VPN-ASA', message: `${pre}: ASA VPN is not generated automatically (IOS crypto map only).`, subject: sujeto }); continue }
      const local = findIface(d, t.localInterface)
      if (!local?.cidr) { diags.push({ severity: 'error', code: 'VPN-LOCAL-IF', message: `${pre}: interface ${t.localInterface} does not exist or has no IP address.`, subject: sujeto }); continue }
      for (const p of [...t.localNetworks, ...t.remoteNetworks]) if (!parseCidr4(p)) diags.push({ severity: 'error', code: 'VPN-NETWORK', message: `${pre}: invalid network "${p}".`, subject: sujeto })
      const peerIp = parseIpv4(t.peer)
      if (peerIp === null) { diags.push({ severity: 'error', code: 'VPN-PEER', message: `${pre}: invalid peer "${t.peer}".`, subject: sujeto }); continue }
      const tabla = ctx.tables.get(d.id) ?? []
      if (!lookup(tabla, peerIp)) diags.push({ severity: 'error', code: 'VPN-PEER-UNREACHABLE', message: `${pre}: no route to peer ${t.peer}.`, subject: sujeto })
      for (const r of t.remoteNetworks) {
        const c = parseCidr4(r)
        const ruta = c ? lookup(tabla, c.ip) : undefined
        if (c && (!ruta || ruta.ifaceKey !== local.key)) {
          diags.push({ severity: 'warning', code: 'VPN-NO-ROUTE', message: `${pre}: traffic to ${r} does not exit via ${local.name} (where the crypto map is applied); it will not be encrypted.`, subject: sujeto, hint: 'Normally the default route to the ISP covers the remote networks.' })
        }
      }
      const peer = [...devices.values()].find((x) => x.ifaces.some((i) => i.cidr?.ip === peerIp))
      if (!peer) { diags.push({ severity: 'info', code: 'VPN-PEER-OUTSIDE-MODEL', message: `${pre}: peer ${t.peer} is not in the model; the remote end is not verified.`, subject: sujeto }); continue }
      const espejo = peer.vpn?.siteToSite.find((x) => parseIpv4(x.peer) === local.cidr!.ip)
      if (!espejo) { diags.push({ severity: 'error', code: 'VPN-NO-MIRROR', message: `${pre}: ${peer.id} has no tunnel with peer ${local.cidr ? `the IP of ${d.id} ${local.name}` : d.id}.`, subject: sujeto }); continue }
      if (!mismasRedes(t.localNetworks, espejo.remoteNetworks) || !mismasRedes(t.remoteNetworks, espejo.localNetworks)) {
        diags.push({ severity: 'error', code: 'VPN-ACL-NOT-MIRRORED', message: `${pre}: the networks do not mirror those of ${peer.id} (${espejo.name}); phase 2 will not come up.`, subject: sujeto })
      }
      if (t.psk !== espejo.psk) diags.push({ severity: 'error', code: 'VPN-PSK-MISMATCH', message: `${pre}: the pre-shared key does not match ${peer.id}.`, subject: sujeto })
      if (ike(t, target) !== ike(espejo, target)) diags.push({ severity: 'error', code: 'VPN-IKE-MISMATCH', message: `${pre}: IKE policy (encryption/hash/DH group) differs from ${peer.id}.`, subject: sujeto })
      if ((t.transform ?? 'esp-aes 256 esp-sha-hmac') !== (espejo.transform ?? 'esp-aes 256 esp-sha-hmac')) diags.push({ severity: 'error', code: 'VPN-TRANSFORM-MISMATCH', message: `${pre}: transform-set differs from ${peer.id}.`, subject: sujeto })
    }
  }
}
