// Generación de configuraciones Cisco IOS / IOS XE a partir del modelo.
// Principio: solo se emiten comandos reales y estándar. Lo que depende de plataforma se comenta.
// Equipos finales (PC, servidores PT, AP) reciben instrucciones de GUI en lugar de CLI.

import type { Acl, AclEntry, Device, Iface, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import { lookupModel } from './catalog.ts'
import {
  broadcastOf, classfulNetwork, formatIpv4, networkOf, parseCidr4, parseIpv4, prefixToMask, prefixToWildcard,
} from './ip.ts'
import { expandRange, normalizeIfName } from './names.ts'
import { generateAsa } from './asa.ts'

export interface GeneratedConfig {
  device: string
  kind: 'cli' | 'gui' | 'unsupported'
  text: string
  verification: string[]
}

const IOS_TYPES = new Set(['router', 'switch', 'l3switch', 'internet'])

/** IOS y PT manejan mal caracteres no ASCII en descripciones/banners: se transliteran. */
function ascii(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '')
}

function ipMask(cidr: string): string {
  const c = parseCidr4(cidr)
  if (!c) throw new Error(`IP inválida "${cidr}"`)
  return `${formatIpv4(c.ip)} ${prefixToMask(c.prefix)}`
}

function netWildcard(prefijo: string): string {
  const c = parseCidr4(prefijo)
  if (!c) throw new Error(`Prefijo inválido "${prefijo}"`)
  return `${formatIpv4(networkOf(c.ip, c.prefix))} ${prefixToWildcard(c.prefix)}`
}

function vlanList(vlans: number[]): string {
  const ord = [...new Set(vlans)].sort((a, b) => a - b)
  const partes: string[] = []
  for (let i = 0; i < ord.length;) {
    let j = i
    while (j + 1 < ord.length && ord[j + 1] === ord[j] + 1) j++
    partes.push(j > i + 1 ? `${ord[i]}-${ord[j]}` : j === i + 1 ? `${ord[i]},${ord[j]}` : `${ord[i]}`)
    i = j + 1
  }
  return partes.join(',')
}

/** "FastEthernet0/1-10" → "interface range FastEthernet0/1 - 10". */
function interfaceHeader(nombre: string): string {
  const lista = expandRange(nombre)
  if (lista.length === 1) return `interface ${normalizeIfName(nombre)}`
  const primero = normalizeIfName(lista[0])
  const fin = nombre.match(/(\d+)\s*$/)![1]
  return `interface range ${primero} - ${fin}`
}

function modeOf(dev: Device, i: Iface): string {
  const n = normalizeIfName(i.name).toLowerCase()
  if (/^vlan\d+$/.test(n)) return 'svi'
  if (/^loopback/.test(n)) return 'loopback'
  if (n.includes('.')) return 'subinterface'
  if (i.mode) return i.mode
  if (dev.type === 'switch') return 'access'
  if (dev.type === 'l3switch') return i.ip ? 'routed' : (i.allowedVlans || i.nativeVlan ? 'trunk' : 'access')
  return 'routed'
}

function aclAddress(addr: string | undefined): string {
  const t = (addr ?? 'any').trim()
  if (t.toLowerCase() === 'any') return 'any'
  if (/^host\s+/i.test(t)) return `host ${t.split(/\s+/)[1]}`
  if (t.includes('/')) {
    const c = parseCidr4(t)
    if (!c) throw new Error(`Dirección de ACL inválida "${t}"`)
    return c.prefix === 32 ? `host ${formatIpv4(c.ip)}` : netWildcard(t)
  }
  if (t.split(/\s+/).length === 2) return t
  return `host ${t}`
}

function aclEntry(acl: Acl, e: AclEntry): string {
  if (e.action === 'remark') return `remark ${e.text ?? ''}`.trim()
  if (acl.type === 'standard') return `${e.action} ${aclAddress(e.src)}${e.log ? ' log' : ''}`
  const partes = [e.action, (e.protocol ?? 'ip').toLowerCase(), aclAddress(e.src)]
  if (e.srcPort) partes.push(e.srcPort)
  partes.push(aclAddress(e.dst))
  if (e.dstPort) partes.push(e.dstPort)
  if (e.established) partes.push('established')
  if (e.log) partes.push('log')
  return partes.join(' ')
}

function aclBlock(acl: Acl): string[] {
  const num = Number(acl.name)
  if (Number.isInteger(num)) return acl.entries.map((e) => `access-list ${num} ${aclEntry(acl, e)}`)
  return [`ip access-list ${acl.type} ${acl.name}`, ...acl.entries.map((e) => ` ${aclEntry(acl, e)}`), 'exit']
}

function ordenInterfaz(dev: Device, i: Iface): number {
  const m = modeOf(dev, i)
  const n = normalizeIfName(i.name).toLowerCase()
  if (m === 'loopback') return 0
  if (n.startsWith('port-channel')) return 2
  if (m === 'subinterface') return 3
  if (m === 'svi') return 4
  return 1
}

function interfaceBlock(dev: Device, i: Iface): string[] {
  const out: string[] = [interfaceHeader(i.name)]
  const m = modeOf(dev, i)
  const cat = lookupModel(dev.model)
  const esSwitch = dev.type === 'switch' || dev.type === 'l3switch'
  if (i.description) out.push(` description ${ascii(i.description)}`)
  if (m === 'subinterface') {
    const vlan = i.vlan ?? Number(i.name.split('.')[1])
    out.push(` encapsulation dot1Q ${vlan}${i.native ? ' native' : ''}`)
  }
  if (esSwitch && (m === 'access' || m === 'trunk')) {
    if (m === 'access') {
      out.push(' switchport mode access')
      if ((i.vlan ?? 1) !== 1) out.push(` switchport access vlan ${i.vlan}`)
      if (i.voiceVlan) out.push(` switchport voice vlan ${i.voiceVlan}`)
      if (i.portSecurity) {
        const ps = i.portSecurity
        out.push(' switchport port-security')
        if (ps.maximum) out.push(` switchport port-security maximum ${ps.maximum}`)
        if (ps.sticky) out.push(' switchport port-security mac-address sticky')
        for (const mac of ps.macs ?? []) out.push(` switchport port-security mac-address ${mac}`)
        if (ps.violation) out.push(` switchport port-security violation ${ps.violation}`)
      }
    } else {
      const enc = cat?.trunkEncapsulation ?? (dev.type === 'l3switch' ? 'required' : 'absent')
      if (enc === 'required') out.push(' switchport trunk encapsulation dot1q')
      if (enc === 'verify') out.push(' ! Si el IOS lo solicita: switchport trunk encapsulation dot1q')
      out.push(' switchport mode trunk')
      if (i.nativeVlan && i.nativeVlan !== 1) out.push(` switchport trunk native vlan ${i.nativeVlan}`)
      if (Array.isArray(i.allowedVlans)) out.push(` switchport trunk allowed vlan ${vlanList(i.allowedVlans)}`)
    }
    if (i.portfast) out.push(' spanning-tree portfast')
    if (i.bpduguard) out.push(' spanning-tree bpduguard enable')
    if (i.channelGroup) out.push(` channel-group ${i.channelGroup.id} mode ${i.channelGroup.mode}`)
  } else if (m === 'routed' && dev.type === 'l3switch') {
    out.push(' no switchport')
  }
  if (i.speed) out.push(` speed ${i.speed}`)
  if (i.duplex) out.push(` duplex ${i.duplex}`)
  if (i.bandwidth) out.push(` bandwidth ${i.bandwidth}`)
  if (i.clockRate) out.push(` clock rate ${i.clockRate}`)
  if (i.ip) out.push(` ip address ${ipMask(i.ip)}`)
  else if (i.dhcp && !HOST_TYPES.has(dev.type)) out.push(' ip address dhcp')
  for (const v6 of i.ipv6 ?? []) out.push(` ipv6 address ${v6}`)
  if (i.linkLocal) out.push(` ipv6 address ${i.linkLocal} link-local`)
  for (const h of i.helper ?? []) out.push(` ip helper-address ${h}`)
  if (i.nat) out.push(` ip nat ${i.nat}`)
  if (i.acl?.in) out.push(` ip access-group ${i.acl.in} in`)
  if (i.acl?.out) out.push(` ip access-group ${i.acl.out} out`)
  if (i.ospf?.cost) out.push(` ip ospf cost ${i.ospf.cost}`)
  if (i.ospfv3) {
    out.push(` ipv6 ospf ${dev.routing?.ospfv3?.processId ?? 1} area ${i.ospfv3.area}`)
    if (i.ospfv3.cost) out.push(` ipv6 ospf cost ${i.ospfv3.cost}`)
  }
  if (i.hsrp) {
    const h = i.hsrp
    if (h.version === 2) out.push(' standby version 2')
    out.push(` standby ${h.group} ip ${h.ip}`)
    if (h.priority !== undefined) out.push(` standby ${h.group} priority ${h.priority}`)
    if (h.preempt) out.push(` standby ${h.group} preempt`)
  }
  out.push(i.shutdown ? ' shutdown' : ' no shutdown')
  out.push('exit')
  return out
}

function deviceVlans(model: NetworkModel, dev: Device): number[] {
  if (dev.vlans) return dev.vlans
  const s = new Set<number>()
  const todas = (model.vlans ?? []).map((v) => v.id)
  for (const i of dev.interfaces) {
    const m = modeOf(dev, i)
    if (m === 'access' && i.vlan) s.add(i.vlan)
    if (i.voiceVlan) s.add(i.voiceVlan)
    if (m === 'trunk') {
      if (i.nativeVlan) s.add(i.nativeVlan)
      ;(Array.isArray(i.allowedVlans) ? i.allowedVlans : todas).forEach((v) => s.add(v))
    }
    if (m === 'svi') s.add(Number(normalizeIfName(i.name).match(/\d+$/)![0]))
  }
  s.delete(1)
  return [...s].sort((a, b) => a - b)
}

function routingBlock(dev: Device): string[] {
  const r = dev.routing
  const out: string[] = []
  if (!r) return out
  for (const s of r.static ?? []) {
    const c = parseCidr4(s.prefix)
    if (!c) continue
    const destino = [s.exitInterface ? normalizeIfName(s.exitInterface) : '', s.nextHop ?? ''].filter(Boolean).join(' ')
    out.push(`ip route ${formatIpv4(c.ip)} ${prefixToMask(c.prefix)} ${destino}${s.ad ? ` ${s.ad}` : ''}`)
  }
  for (const s of r.ipv6Static ?? []) {
    out.push(`ipv6 route ${s.prefix} ${[s.exitInterface ? normalizeIfName(s.exitInterface) : '', s.nextHop ?? ''].filter(Boolean).join(' ')}`)
  }
  const ifsIp = dev.interfaces.filter((i) => i.ip)
  if (r.ospf) {
    const o = r.ospf
    out.push(`router ospf ${o.processId ?? 1}`)
    if (o.routerId) out.push(` router-id ${o.routerId}`)
    if (o.referenceBandwidth) out.push(` auto-cost reference-bandwidth ${o.referenceBandwidth}`)
    const nets = o.networks ?? ifsIp.filter((i) => i.ospf).map((i) => ({ prefix: i.ip!, area: i.ospf!.area }))
    for (const n of nets) out.push(` network ${netWildcard(n.prefix)} area ${n.area}`)
    const pasivas = [...(o.passiveInterfaces ?? []), ...dev.interfaces.filter((i) => i.ospf?.passive).map((i) => i.name)]
    for (const p of [...new Set(pasivas.map(normalizeIfName))]) out.push(` passive-interface ${p}`)
    if (o.defaultOriginate) out.push(' default-information originate')
    out.push('exit')
  }
  if (r.eigrp) {
    const e = r.eigrp
    out.push(`router eigrp ${e.as}`)
    if (e.routerId) out.push(` eigrp router-id ${e.routerId}`)
    const nets = e.networks ?? ifsIp.filter((i) => i.nat !== 'outside').map((i) => i.ip!)
    for (const n of [...new Set(nets.map((x) => (x.includes('/') ? netWildcard(x) : x)))]) out.push(` network ${n}`)
    for (const p of e.passiveInterfaces ?? []) out.push(` passive-interface ${normalizeIfName(p)}`)
    out.push(' no auto-summary')
    out.push('exit')
  }
  if (r.rip) {
    const rp = r.rip
    out.push('router rip')
    out.push(` version ${rp.version ?? 2}`)
    const fuentes = rp.networks ?? ifsIp.filter((i) => i.nat !== 'outside').map((i) => i.ip!)
    const redes = new Set<string>()
    for (const f of fuentes) {
      const ip = parseIpv4(f.split('/')[0])
      if (ip !== null) redes.add(formatIpv4(classfulNetwork(ip).ip))
    }
    for (const n of redes) out.push(` network ${n}`)
    for (const p of rp.passiveInterfaces ?? []) out.push(` passive-interface ${normalizeIfName(p)}`)
    if (rp.defaultOriginate) out.push(' default-information originate')
    if ((rp.version ?? 2) === 2 && rp.noAutoSummary !== false) out.push(' no auto-summary')
    out.push('exit')
  }
  if (r.bgp) {
    const b = r.bgp
    out.push(`router bgp ${b.as}`)
    if (b.routerId) out.push(` bgp router-id ${b.routerId}`)
    for (const n of b.neighbors) {
      out.push(` neighbor ${n.ip} remote-as ${n.remoteAs}`)
      if (n.description) out.push(` neighbor ${n.ip} description ${ascii(n.description)}`)
    }
    for (const n of b.networks ?? []) {
      const c = parseCidr4(n)
      if (c) out.push(` network ${formatIpv4(networkOf(c.ip, c.prefix))} mask ${prefixToMask(c.prefix)}`)
    }
    out.push('exit')
  }
  return out
}

function servicesBlock(dev: Device): string[] {
  const s = dev.services
  const out: string[] = []
  if (!s) return out
  if (s.dhcp) {
    for (const ex of s.dhcp.excluded ?? []) out.push(`ip dhcp excluded-address ${ex.from}${ex.to ? ` ${ex.to}` : ''}`)
    for (const p of s.dhcp.pools) {
      const c = parseCidr4(p.network)
      if (!c) continue
      out.push(`ip dhcp pool ${p.name}`)
      out.push(` network ${formatIpv4(networkOf(c.ip, c.prefix))} ${prefixToMask(c.prefix)}`)
      if (p.defaultRouter) out.push(` default-router ${p.defaultRouter}`)
      if (p.dns?.length) out.push(` dns-server ${p.dns.join(' ')}`)
      if (p.domain) out.push(` domain-name ${p.domain}`)
      if (p.leaseDays) out.push(` lease ${p.leaseDays}`)
      out.push('exit')
    }
  }
  if (s.nat) {
    const n = s.nat
    const tuneles = dev.vpn?.siteToSite ?? []
    // con VPN, el tráfico entre sitios se excluye del NAT (ACL extendida con deny previos)
    const acl = tuneles.length ? (n.aclName && !Number.isInteger(Number(n.aclName)) ? n.aclName : 'NAT-INSIDE') : n.aclName ?? '1'
    if (n.insideSources?.length) {
      const entradas = n.insideSources.map((p) => `permit ${netWildcard(p)}`)
      if (tuneles.length) {
        out.push(`ip access-list extended ${acl}`, ' remark Exencion de NAT para el trafico de la VPN')
        for (const t of tuneles) for (const l of t.localNetworks) for (const r of t.remoteNetworks) out.push(` deny ip ${netWildcard(l)} ${netWildcard(r)}`)
        for (const p of n.insideSources) out.push(` permit ip ${netWildcard(p)} any`)
        out.push('exit')
      } else if (Number.isInteger(Number(acl))) entradas.forEach((e) => out.push(`access-list ${acl} ${e}`))
      else out.push(`ip access-list standard ${acl}`, ...entradas.map((e) => ` ${e}`), 'exit')
      if (n.overloadInterface) out.push(`ip nat inside source list ${acl} interface ${normalizeIfName(n.overloadInterface)} overload`)
      else if (n.pool) {
        out.push(`ip nat pool ${n.pool.name} ${n.pool.start} ${n.pool.end} netmask ${prefixToMask(n.pool.prefix)}`)
        out.push(`ip nat inside source list ${acl} pool ${n.pool.name}${n.pool.overload ? ' overload' : ''}`)
      }
    }
    for (const st of n.static ?? []) out.push(`ip nat inside source static ${st.inside} ${st.outside}`)
  }
  if (s.ntpServer) out.push(`ntp server ${s.ntpServer}`)
  if (s.syslogServer) out.push(`logging host ${s.syslogServer}`)
  if (s.snmp) out.push(`snmp-server community ${s.snmp.community} ${s.snmp.mode.toUpperCase()}`)
  return out
}

function securityHeader(dev: Device): string[] {
  const s = dev.security
  const out: string[] = []
  if (!s) return out
  if (s.minPasswordLength) out.push(`security passwords min-length ${s.minPasswordLength}`)
  if (s.enableSecret) out.push(`enable secret ${s.enableSecret}`)
  if (s.servicePasswordEncryption) out.push('service password-encryption')
  if (s.banner) out.push(`banner motd #${ascii(s.banner).replace(/#/g, '')}#`)
  return out
}

function linesBlock(dev: Device, target: string): string[] {
  const s = dev.security
  const out: string[] = []
  if (!s) return out
  const cat = lookupModel(dev.model)
  const vty = cat?.vty || (dev.type === 'switch' || dev.type === 'l3switch' ? '0 15' : '0 4')
  if (s.ssh) {
    out.push(`ip domain-name ${s.ssh.domain}`)
    out.push(`username ${s.ssh.username} privilege 15 secret ${s.ssh.password}`)
    const mod = s.ssh.modulus ?? (target === 'packet-tracer' ? 1024 : 2048)
    out.push(`crypto key generate rsa general-keys modulus ${mod}`)
    out.push('ip ssh version 2')
  }
  if (s.consolePassword) {
    out.push('line console 0', ` password ${s.consolePassword}`, ' login', ' logging synchronous', 'exit')
  }
  if (s.ssh || s.vtyPassword || s.vtyAcl) {
    out.push(`line vty ${vty}`)
    if (s.ssh) out.push(' login local', ' transport input ssh')
    else if (s.vtyPassword) out.push(` password ${s.vtyPassword}`, ' login')
    if (s.vtyAcl) out.push(` access-class ${s.vtyAcl} in`)
    out.push(' exec-timeout 10 0', 'exit')
  }
  return out
}

function stpBlock(dev: Device): string[] {
  const s = dev.stp
  const out: string[] = []
  if (!s) return out
  if (s.mode) out.push(`spanning-tree mode ${s.mode}`)
  if (s.rootPrimary?.length) out.push(`spanning-tree vlan ${vlanList(s.rootPrimary)} root primary`)
  if (s.rootSecondary?.length) out.push(`spanning-tree vlan ${vlanList(s.rootSecondary)} root secondary`)
  for (const p of s.priorities ?? []) out.push(`spanning-tree vlan ${vlanList(p.vlans)} priority ${p.priority}`)
  return out
}

export function verificationCommands(dev: Device): string[] {
  if (!IOS_TYPES.has(dev.type)) return []
  const c = ['show running-config', 'show ip interface brief', 'show cdp neighbors']
  const ifs = dev.interfaces
  const esSwitch = dev.type === 'switch' || dev.type === 'l3switch'
  if (esSwitch) c.push('show vlan brief', 'show interfaces status')
  if (ifs.some((i) => modeOf(dev, i) === 'trunk')) c.push('show interfaces trunk')
  if (esSwitch) c.push('show mac address-table', 'show spanning-tree')
  if (ifs.some((i) => i.portSecurity)) c.push('show port-security', 'show port-security interface <interfaz>')
  if (ifs.some((i) => i.channelGroup)) c.push('show etherchannel summary')
  if (dev.type !== 'switch') c.push('show ip route')
  if (dev.routing?.ospf) c.push('show ip protocols', 'show ip ospf neighbor', 'show ip ospf interface brief')
  if (dev.routing?.eigrp) c.push('show ip protocols', 'show ip eigrp neighbors', 'show ip eigrp topology')
  if (dev.routing?.rip) c.push('show ip protocols', 'show ip rip database')
  if (dev.routing?.bgp) c.push('show ip bgp summary', 'show ip bgp')
  if (dev.services?.dhcp) c.push('show ip dhcp pool', 'show ip dhcp binding', 'show ip dhcp conflict')
  if (dev.services?.nat) c.push('show ip nat translations', 'show ip nat statistics')
  if (dev.acls?.length) c.push('show access-lists', 'show ip interface <interfaz>  (ACL aplicadas)')
  if (dev.security?.ssh) c.push('show ip ssh', 'show ssh')
  if (ifs.some((i) => i.hsrp)) c.push('show standby brief')
  if (dev.routing?.ospfv3 || ifs.some((i) => i.ospfv3)) c.push('show ipv6 ospf neighbor', 'show ipv6 route ospf')
  if (dev.vpn?.siteToSite?.length) c.push('show crypto isakmp sa', 'show crypto ipsec sa', 'show crypto map')
  if (esSwitch && dev.stp) c.push('show spanning-tree summary')
  if (ifs.some((i) => i.ipv6?.length)) c.push('show ipv6 interface brief', 'show ipv6 route')
  return [...new Set(c)]
}

function guiInstructions(dev: Device): string {
  const out: string[] = [`# ${dev.id} — ${dev.model ?? dev.type} (configuración por GUI en Packet Tracer)`, '']
  const host = dev.interfaces.find((i) => !/^(vlan|loopback)/i.test(i.name))
  if (HOST_TYPES.has(dev.type) && host) {
    out.push('Desktop > IP Configuration:')
    if (host.dhcp) out.push('  - IPv4: DHCP (verificar con "ipconfig" en Command Prompt; renovar con "ipconfig /renew")')
    else if (host.ip) {
      const c = parseCidr4(host.ip)!
      out.push(`  - IPv4 Address: ${formatIpv4(c.ip)}`, `  - Subnet Mask: ${prefixToMask(c.prefix)}`)
      out.push(`  - Default Gateway: ${dev.gateway ?? '(ninguno)'}`)
      if (dev.dns?.length) out.push(`  - DNS Server: ${dev.dns[0]}`)
    }
    for (const v6 of host.ipv6 ?? []) out.push(`  - IPv6 (Static): ${v6}${dev.ipv6Gateway ? ` | Gateway: ${dev.ipv6Gateway}` : ''}`)
    out.push('')
  }
  const s = dev.services
  if (s?.dhcp && dev.type === 'server') {
    out.push('Services > DHCP (Service: On). Un pool por red:')
    for (const p of s.dhcp.pools) {
      const c = parseCidr4(p.network)
      if (!c) continue
      const red = networkOf(c.ip, c.prefix)
      let inicio = red + 1
      const excl = (s.dhcp.excluded ?? []).map((e) => [parseIpv4(e.from) ?? 0, parseIpv4(e.to ?? e.from) ?? 0])
      while (excl.some(([a, b]) => inicio >= a && inicio <= b) || formatIpv4(inicio) === p.defaultRouter) inicio++
      const max = broadcastOf(c.ip, c.prefix) - inicio
      out.push(`  - Pool Name: ${p.name} | Default Gateway: ${p.defaultRouter ?? '0.0.0.0'} | DNS Server: ${p.dns?.[0] ?? '0.0.0.0'}`)
      out.push(`    Start IP Address: ${formatIpv4(inicio)} | Subnet Mask: ${prefixToMask(c.prefix)} | Maximum Number of Users: ${max}`)
    }
    out.push('  (Las redes remotas necesitan "ip helper-address" en su gateway apuntando a este servidor.)', '')
  }
  if (s?.dns) {
    out.push('Services > DNS (DNS Service: On):')
    for (const r of s.dns.records) out.push(`  - Name: ${r.name} | Type: ${r.type === 'A' ? 'A Record' : r.type === 'AAAA' ? 'AAAA Record' : 'CNAME'} | Address: ${r.value}`)
    out.push('')
  }
  const servicios = (['http', 'https', 'ftp', 'tftp', 'email', 'syslog', 'ntp'] as const).filter((k) => s?.[k])
  if (servicios.length) out.push(`Services: activar ${servicios.map((x) => x.toUpperCase()).join(', ')}.`, '')
  if (dev.type === 'ap') out.push('Config > Port 1: SSID, canal y autenticación (WPA2-PSK + clave). Ver references/wireless.md.', '')
  if (dev.type === 'wireless-router') out.push('GUI: Internet Setup, Network Setup (IP LAN y DHCP) y Wireless (SSID/seguridad). Ver references/wireless.md.', '')
  const cat = lookupModel(dev.model)
  for (const n of cat?.notes ?? []) out.push(`Nota: ${n}`)
  return out.join('\n').trimEnd() + '\n'
}

export function generateConfig(model: NetworkModel, dev: Device): GeneratedConfig {
  const target = model.meta?.target ?? 'packet-tracer'
  const plataforma = dev.platform ?? lookupModel(dev.model)?.platform
  if (plataforma === 'asa' || (dev.type === 'firewall' && plataforma !== 'ios' && plataforma !== 'iosxe')) {
    return { device: dev.id, kind: 'cli', text: generateAsa(model, dev), verification: ['show running-config', 'show interface ip brief', 'show nameif', 'show route', 'show xlate', 'show nat', 'show access-list', 'show conn', ...(dev.services?.dhcp ? ['show dhcpd binding'] : [])] }
  }
  if (dev.type === 'firewall') {
    const texto = [
      `! ${dev.id}: sintaxis ASA/firewall no generada automáticamente (no es IOS).`,
      '! Ver references/security.md (sección Firewalls) y construya la configuración a mano.',
      ...(dev.extraConfig ?? []),
    ].join('\n')
    return { device: dev.id, kind: 'unsupported', text: texto + '\n', verification: ['show running-config', 'show interface ip brief', 'show nameif', 'show route', 'show xlate'] }
  }
  if (!IOS_TYPES.has(dev.type)) return { device: dev.id, kind: 'gui', text: guiInstructions(dev), verification: [] }

  const cat = lookupModel(dev.model)
  const so = dev.platform ?? cat?.platform ?? 'ios'
  const L: string[] = []
  const seccion = (titulo: string, lineas: string[]): void => {
    if (!lineas.length) return
    L.push('!', `! --- ${titulo} ---`, ...lineas)
  }
  L.push('! ' + '='.repeat(66))
  L.push(`! ${dev.id} — ${dev.vendor ?? 'cisco'} ${dev.model ?? dev.type} (${so === 'iosxe' ? 'IOS XE' : 'IOS'})`)
  L.push(`! Red: ${model.meta?.name ?? ''} | Destino: ${target}`)
  L.push('! Generado desde el modelo (fuente única de verdad). Pegar desde EXEC de usuario.')
  for (const n of cat?.notes ?? []) L.push(`! Nota: ${n}`)
  L.push('! ' + '='.repeat(66))
  L.push('enable', 'configure terminal', `hostname ${dev.id}`, 'no ip domain-lookup')
  seccion('Seguridad básica', securityHeader(dev))
  if (dev.type === 'switch' || dev.type === 'l3switch') {
    if (dev.vtpMode) seccion('VTP', [`vtp mode ${dev.vtpMode}`])
    const nombres = new Map((model.vlans ?? []).map((v) => [v.id, v.name]))
    const vl = deviceVlans(model, dev).flatMap((v) => [`vlan ${v}`, ...(nombres.get(v) ? [` name ${ascii(nombres.get(v)!).replace(/\s+/g, '_')}`] : []), 'exit'])
    seccion('VLAN', vl)
    seccion('Spanning Tree', stpBlock(dev))
  }
  const necesitaV6 = dev.interfaces.some((i) => i.ipv6?.length || i.linkLocal) && dev.type !== 'switch'
  const globales: string[] = []
  if (dev.type === 'l3switch' && dev.routing?.ipRouting !== false) globales.push('ip routing')
  if (necesitaV6) globales.push('ipv6 unicast-routing')
  globales.push(...ospfv3Block(dev))
  seccion('Routing global', globales)
  const acls = (dev.acls ?? []).flatMap(aclBlock)
  seccion('ACL', acls)
  const ordenadas = [...dev.interfaces].sort((a, b) => ordenInterfaz(dev, a) - ordenInterfaz(dev, b))
  seccion('Interfaces', ordenadas.flatMap((i) => interfaceBlock(dev, i)))
  if (dev.type === 'switch' && dev.gateway) seccion('Gateway de gestión', [`ip default-gateway ${dev.gateway}`])
  seccion('Routing', routingBlock(dev))
  seccion('Servicios', servicesBlock(dev))
  seccion('VPN IPsec site-to-site', vpnBlock(dev, target))
  seccion('Acceso remoto y líneas', linesBlock(dev, target))
  if (dev.extraConfig?.length) seccion('Configuración adicional (NO verificada por la herramienta)', dev.extraConfig)
  L.push('!', 'end', 'write memory')
  return { device: dev.id, kind: 'cli', text: L.join('\n') + '\n', verification: verificationCommands(dev) }
}

function ospfv3Block(dev: Device): string[] {
  const usa = dev.routing?.ospfv3 || dev.interfaces.some((i) => i.ospfv3)
  if (!usa) return []
  const o = dev.routing?.ospfv3
  const out = [`ipv6 router ospf ${o?.processId ?? 1}`]
  const rid = o?.routerId ?? dev.routing?.ospf?.routerId
  if (rid) out.push(` router-id ${rid}`)
  else out.push(' ! sin router-id explícito: IOS usa la IPv4 más alta (si no hay IPv4, configure router-id)')
  for (const p of o?.passiveInterfaces ?? []) out.push(` passive-interface ${normalizeIfName(p)}`)
  if (o?.defaultOriginate) out.push(' default-information originate')
  out.push('exit')
  return out
}

function vpnBlock(dev: Device, target: string): string[] {
  const tuneles = dev.vpn?.siteToSite ?? []
  if (!tuneles.length) return []
  const out: string[] = []
  const cat = lookupModel(dev.model)
  if (cat?.model === '2911' || cat?.model === '1941' || cat?.model === '2901') {
    out.push('! Requisito (una vez, fuera de este bloque): license boot module c' + (cat.model === '1941' ? '1900' : '2900') + ' technology-package securityk9, write memory y reload')
  } else {
    out.push('! Verifique que la licencia/imagen incluya seguridad (securityk9) antes de aplicar.')
  }
  const politicas: string[] = []
  for (const t of tuneles) {
    const p = `${t.ike?.encryption ?? 'aes 256'}|${t.ike?.hash ?? 'sha'}|${t.ike?.group ?? (target === 'packet-tracer' ? 5 : 14)}|${t.ike?.lifetime ?? 86400}`
    if (!politicas.includes(p)) politicas.push(p)
  }
  politicas.forEach((p, n) => {
    const [enc, hash, grupo, vida] = p.split('|')
    out.push(`crypto isakmp policy ${(n + 1) * 10}`, ` encryption ${enc}`, ` hash ${hash}`, ' authentication pre-share', ` group ${grupo}`, ` lifetime ${vida}`, 'exit')
  })
  const porInterfaz = new Map<string, typeof tuneles>()
  for (const t of tuneles) {
    const k = normalizeIfName(t.localInterface)
    porInterfaz.set(k, [...(porInterfaz.get(k) ?? []), t])
  }
  let nMapa = 0
  for (const [ifName, ts] of porInterfaz) {
    const mapa = nMapa++ === 0 ? 'VPN-MAP' : `VPN-MAP-${nMapa}`
    ts.forEach((t, n) => {
      const nombre = t.name.toUpperCase().replace(/[^A-Z0-9-]/g, '-')
      out.push(`crypto isakmp key ${t.psk} address ${t.peer}`)
      out.push(`crypto ipsec transform-set ${nombre}-TS ${t.transform ?? 'esp-aes 256 esp-sha-hmac'}`)
      out.push(`ip access-list extended VPN-${nombre}`)
      for (const l of t.localNetworks) for (const r of t.remoteNetworks) out.push(` permit ip ${netWildcard(l)} ${netWildcard(r)}`)
      out.push('exit')
      out.push(`crypto map ${mapa} ${(n + 1) * 10} ipsec-isakmp`, ` set peer ${t.peer}`, ` set transform-set ${nombre}-TS`, ` match address VPN-${nombre}`, 'exit')
    })
    out.push(`interface ${ifName}`, ` crypto map ${mapa}`, 'exit')
  }
  return out
}

export function generateAll(model: NetworkModel): GeneratedConfig[] {
  return model.devices.map((d) => generateConfig(model, d))
}

