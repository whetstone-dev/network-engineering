// Generación de configuración Cisco ASA (5506-X: interfaces ruteadas; 5505: puertos L2 + interface VlanX).
// Sintaxis ASA 8.3+ (NAT por objetos, ACL con máscaras, access-group por nameif).

import type { Acl, AclEntry, Device, Iface, NetworkModel } from './model.ts'
import { lookupModel } from './catalog.ts'
import { broadcastOf, containsIp, formatIpv4, networkOf, parseCidr4, parseIpv4, prefixToMask } from './ip.ts'
import { normalizeIfName } from './names.ts'

function ascii(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '')
}

/** Dirección para ACL de ASA: usa máscara de red (no wildcard). */
function asaAddr(addr: string | undefined): string {
  const t = (addr ?? 'any').trim()
  if (t.toLowerCase() === 'any') return 'any'
  if (/^host\s+/i.test(t)) return `host ${t.split(/\s+/)[1]}`
  if (t.includes('/')) {
    const c = parseCidr4(t)
    if (!c) throw new Error(`Dirección inválida "${t}"`)
    return c.prefix === 32 ? `host ${formatIpv4(c.ip)}` : `${formatIpv4(networkOf(c.ip, c.prefix))} ${prefixToMask(c.prefix)}`
  }
  if (t.split(/\s+/).length === 2) {
    // "red wildcard" de IOS → convertir a máscara
    const [ip, wc] = t.split(/\s+/)
    const w = parseIpv4(wc)
    return w === null ? t : `${ip} ${formatIpv4(~w >>> 0)}`
  }
  return `host ${t}`
}

function asaEntry(acl: Acl, e: AclEntry): string {
  if (e.action === 'remark') return `access-list ${acl.name} remark ${ascii(e.text ?? '')}`
  if (acl.type === 'standard') return `access-list ${acl.name} standard ${e.action} ${asaAddr(e.src)}`
  const p = [`access-list ${acl.name} extended ${e.action}`, (e.protocol ?? 'ip').toLowerCase(), asaAddr(e.src)]
  if (e.srcPort) p.push(e.srcPort)
  p.push(asaAddr(e.dst))
  if (e.dstPort) p.push(e.dstPort)
  if (e.log) p.push('log')
  return p.join(' ')
}

function ipMask(cidr: string): string {
  const c = parseCidr4(cidr)!
  return `${formatIpv4(c.ip)} ${prefixToMask(c.prefix)}`
}

/** nameif de la interfaz cuya subred contiene la IP/prefijo. */
function nameifFor(dev: Device, ip: number): string | undefined {
  for (const i of dev.interfaces) {
    const c = i.ip ? parseCidr4(i.ip) : null
    if (c && containsIp(c, ip) && i.nameif) return i.nameif
  }
  return undefined
}

function findIf(dev: Device, nombre: string): Iface | undefined {
  const k = normalizeIfName(nombre).toLowerCase()
  return dev.interfaces.find((i) => normalizeIfName(i.name).toLowerCase() === k)
}

export function generateAsa(model: NetworkModel, dev: Device): string {
  const target = model.meta?.target ?? 'packet-tracer'
  const cat = lookupModel(dev.model)
  const es5505 = cat?.model === 'ASA5505'
  const L: string[] = []
  const sec = (t: string, l: string[]): void => { if (l.length) L.push('!', `! --- ${t} ---`, ...l) }
  L.push('! ' + '='.repeat(66))
  L.push(`! ${dev.id} — Cisco ${dev.model ?? 'ASA'} (sintaxis ASA 8.3+, no IOS)`)
  L.push(`! Red: ${model.meta?.name ?? ''} | Destino: ${target}`)
  L.push('! Generado desde el modelo. Pegar desde el prompt ciscoasa> (enable sin contraseña la primera vez: Enter).')
  for (const n of cat?.notes ?? []) L.push(`! Nota: ${n}`)
  L.push('! ' + '='.repeat(66))
  L.push('enable', 'configure terminal', `hostname ${dev.id}`)
  if (dev.security?.enableSecret) L.push(`enable password ${dev.security.enableSecret}`)
  if (dev.security?.ssh) L.push(`domain-name ${dev.security.ssh.domain}`)

  // Interfaces: en 5505 primero los puertos L2 y luego las interface VlanN
  const ifs: string[] = []
  const fisicas = dev.interfaces.filter((i) => !/^vlan\d+$/i.test(normalizeIfName(i.name)))
  const svis = dev.interfaces.filter((i) => /^vlan\d+$/i.test(normalizeIfName(i.name)))
  // en el 5505 las interface VlanN (nameif) se crean antes de asignarlas a los puertos
  for (const i of [...svis, ...fisicas]) {
    ifs.push(`interface ${normalizeIfName(i.name)}`)
    if (i.description) ifs.push(` description ${ascii(i.description)}`)
    if (es5505 && !svis.includes(i)) {
      if (i.vlan && i.vlan !== 1) ifs.push(` switchport access vlan ${i.vlan}`)
    } else {
      if (i.nameif) ifs.push(` nameif ${i.nameif}`)
      if (i.nameif) ifs.push(` security-level ${i.securityLevel ?? (i.nameif === 'inside' ? 100 : 0)}`)
      if (i.ip) ifs.push(` ip address ${ipMask(i.ip)}`)
      else if (i.dhcp) ifs.push(' ip address dhcp setroute')
    }
    ifs.push(i.shutdown ? ' shutdown' : ' no shutdown', 'exit')
  }
  sec('Interfaces', ifs)
  if (dev.firewall?.sameSecurityPermit) sec('Mismo nivel de seguridad', ['same-security-traffic permit inter-interface'])

  // Rutas
  const rutas: string[] = []
  for (const r of dev.routing?.static ?? []) {
    const c = parseCidr4(r.prefix)
    const nh = r.nextHop ? parseIpv4(r.nextHop) : null
    const nif = r.exitInterface ? findIf(dev, r.exitInterface)?.nameif : nh !== null ? nameifFor(dev, nh) : undefined
    if (!c || !nif || !r.nextHop) { rutas.push(`! Ruta ${r.prefix}: indique nextHop en una red conectada (route <nameif> <red> <máscara> <gateway>)`); continue }
    rutas.push(`route ${nif} ${formatIpv4(networkOf(c.ip, c.prefix))} ${prefixToMask(c.prefix)} ${r.nextHop}${r.ad ? ` ${r.ad}` : ''}`)
  }
  sec('Rutas', rutas)

  // NAT por objetos
  const nat = dev.services?.nat
  const natL: string[] = []
  if (nat) {
    const fuera = nat.overloadInterface ? findIf(dev, nat.overloadInterface)?.nameif : 'outside'
    ;(nat.insideSources ?? []).forEach((p, n) => {
      const c = parseCidr4(p)
      if (!c) return
      const dentro = nameifFor(dev, networkOf(c.ip, c.prefix) + 1) ?? 'inside'
      natL.push(`object network NET-${dentro.toUpperCase()}-${n + 1}`, ` subnet ${formatIpv4(networkOf(c.ip, c.prefix))} ${prefixToMask(c.prefix)}`, ` nat (${dentro},${fuera}) dynamic interface`, 'exit')
    })
    for (const st of nat.static ?? []) {
      const ip = parseIpv4(st.inside)
      const dentro = ip !== null ? nameifFor(dev, ip) ?? 'dmz' : 'dmz'
      natL.push(`object network HOST-${st.inside.replace(/\./g, '-')}`, ` host ${st.inside}`, ` nat (${dentro},${fuera ?? 'outside'}) static ${st.outside}`, 'exit')
    }
  }
  sec('NAT (objetos)', natL)

  // ACL y access-group
  const aclL = (dev.acls ?? []).flatMap((a) => a.entries.map((e) => asaEntry(a, e)))
  for (const i of dev.interfaces) {
    if (i.acl?.in && i.nameif) aclL.push(`access-group ${i.acl.in} in interface ${i.nameif}`)
    if (i.acl?.out && i.nameif) aclL.push(`access-group ${i.acl.out} out interface ${i.nameif}`)
  }
  sec('ACL (máscaras de red, no wildcard)', aclL)

  if (dev.firewall?.inspectIcmp) {
    sec('Inspección ICMP (permite las respuestas de ping)', ['! Usa la global_policy / class inspection_default de la configuración de fábrica (ya aplicada con service-policy global_policy global)', 'policy-map global_policy', ' class inspection_default', '  inspect icmp', ' exit', 'exit'])
  }

  // DHCP
  const dh = dev.services?.dhcp
  const dhL: string[] = []
  for (const p of dh?.pools ?? []) {
    const c = parseCidr4(p.network)
    if (!c) continue
    const nif = nameifFor(dev, networkOf(c.ip, c.prefix) + 1)
    if (!nif) { dhL.push(`! Pool ${p.name}: ninguna interfaz con nameif en ${p.network}`); continue }
    const gw = p.defaultRouter ? parseIpv4(p.defaultRouter) : null
    const excl = (dh?.excluded ?? []).map((e) => [parseIpv4(e.from) ?? 0, parseIpv4(e.to ?? e.from) ?? 0])
    let ini = networkOf(c.ip, c.prefix) + 1
    while (excl.some(([a, b]) => ini >= a && ini <= b) || ini === gw) ini++
    let fin = broadcastOf(c.ip, c.prefix) - 1
    if (es5505) {
      fin = Math.min(fin, ini + 31)
      dhL.push('! ASA 5505 con licencia base: pool limitado (32 direcciones) — verificar según licencia')
    }
    dhL.push(`dhcpd address ${formatIpv4(ini)}-${formatIpv4(fin)} ${nif}`)
    if (p.dns?.length) dhL.push(`dhcpd dns ${p.dns.slice(0, 2).join(' ')}`)
    dhL.push(`dhcpd enable ${nif}`)
  }
  sec('DHCP', dhL)

  // SSH
  const s = dev.security
  if (s?.ssh) {
    const internas = dev.interfaces.filter((i) => i.ip && (i.securityLevel ?? (i.nameif === 'inside' ? 100 : 0)) === 100 && i.nameif)
    sec('SSH', [
      `username ${s.ssh.username} password ${s.ssh.password} privilege 15`,
      'aaa authentication ssh console LOCAL',
      `crypto key generate rsa modulus ${s.ssh.modulus ?? (target === 'packet-tracer' ? 1024 : 2048)}`,
      ...internas.map((i) => { const c = parseCidr4(i.ip!)!; return `ssh ${formatIpv4(networkOf(c.ip, c.prefix))} ${prefixToMask(c.prefix)} ${i.nameif}` }),
      'ssh timeout 10',
    ])
  }
  if (dev.extraConfig?.length) sec('Configuración adicional (NO verificada por la herramienta)', dev.extraConfig)
  L.push('!', 'end', 'write memory')
  return L.join('\n') + '\n'
}
