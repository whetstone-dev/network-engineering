// Importa configuraciones existentes ("show running-config" de IOS/IOS XE y, básico, ASA) y salidas de
// "show cdp neighbors [detail]" a un modelo *.net.json. Las contraseñas y claves NO se importan
// (se reemplazan por marcadores). Lo que no se reconoce se conserva en extraConfig (no verificado).

import type { Acl, AclEntry, Device, DeviceType, IpsecTunnel, Iface, Link, NetworkModel, Platform } from './model.ts'
import { MODEL_VERSION } from './model.ts'
import { cidrKey, formatIpv4, maskToPrefix, networkOf, parseCidr4, parseIpv4 } from './ip.ts'
import { ifKey, naturalCompare, normalizeIfName } from './names.ts'

export interface ImportFile { name: string; text: string }
export interface ImportResult { model: NetworkModel; report: string[] }

const SECRETO = '<SECRETO>'

// Líneas sin valor para el modelo (ruido de running-config)
const IGNORAR = [
  /^version\b/, /^service (timestamps|pad|config)/, /^no service pad/, /^boot-(start|end)-marker/, /^!/, /^end$/, /^Building configuration/i,
  /^Current configuration/i, /^no aaa new-model/, /^ip cef/, /^no ipv6 cef/, /^ipv6 cef/, /^spanning-tree extend system-id/, /^license /,
  /^no ip domain[- ]lookup/, /^ip classless/, /^no ip http/, /^ip http/, /^memory-size/, /^no ip source-route/, /^control-plane/,
  /^ASA Version/i, /^no ip cef/, /^: /, /^Cryptochecksum/i, /^terminal width/, /^logging synchronous/, /^redundancy/, /^ip flow-export/, /^no cdp run/,
  /^no service timestamps/, /^line aux/, /^vtp domain/, /^vtp version/, /^ntp master/, /^policy-map/, /^class-map/, /^service-policy/,
  // comandos de script pegado (no son parte de la running-config)
  /^enable$/, /^conf(igure)?( t(erminal)?)?$/, /^exit$/, /^write( memory)?$/, /^wr$/, /^copy run/, /^do /,
]

function wildcardToPrefix(ip: string, wc: string): string | null {
  const w = parseIpv4(wc)
  const a = parseIpv4(ip)
  if (w === null || a === null) return null
  const mascara = formatIpv4(~w >>> 0)
  const p = maskToPrefix(mascara)
  return p === null ? null : `${formatIpv4(networkOf(a, p))}/${p}`
}

function maskPrefix(ip: string, mask: string): string | null {
  const c = parseCidr4(`${ip} ${mask}`)
  return c ? `${formatIpv4(c.ip)}/${c.prefix}` : null
}

function vlanList(texto: string): number[] {
  const out: number[] = []
  for (const parte of texto.split(',')) {
    const m = parte.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let v = a; v <= b && v - a < 4094; v++) out.push(v)
  }
  return out
}

/** Interpreta direcciones de ACL desde tokens: any | host X | X wildcard | X (std). */
function aclAddr(tokens: string[], asa: boolean): string | undefined {
  const t = tokens.shift()
  if (!t) return undefined
  if (t === 'any' || t === 'any4') return 'any'
  if (t === 'host') return `host ${tokens.shift()}`
  if (t === 'object' || t === 'object-group') return `${t} ${tokens.shift()}`
  const sig = tokens[0]
  if (sig && /^\d+\.\d+\.\d+\.\d+$/.test(sig)) {
    tokens.shift()
    const pref = asa ? maskPrefix(t, sig) : wildcardToPrefix(t, sig)
    return pref ?? `${t} ${sig}`
  }
  return `host ${t}`
}

function aclPort(tokens: string[]): string | undefined {
  if (['eq', 'neq', 'gt', 'lt'].includes(tokens[0])) return `${tokens.shift()} ${tokens.shift()}`
  if (tokens[0] === 'range') return `${tokens.shift()} ${tokens.shift()} ${tokens.shift()}`
  return undefined
}

function parseAclEntry(texto: string, tipo: 'standard' | 'extended', asa: boolean): AclEntry | null {
  const tokens = texto.trim().split(/\s+/)
  if (/^\d+$/.test(tokens[0])) tokens.shift()       // número de secuencia
  const action = tokens.shift()
  if (action === 'remark') return { action: 'remark', text: tokens.join(' ') }
  if (action !== 'permit' && action !== 'deny') return null
  if (tipo === 'standard') {
    const src = aclAddr(tokens, asa)
    return tokens.includes('log') ? { action, src, log: true } : { action, src }
  }
  const protocol = tokens.shift()
  const src = aclAddr(tokens, asa)
  const srcPort = aclPort(tokens)
  const dst = aclAddr(tokens, asa)
  const dstPort = aclPort(tokens)
  const e: AclEntry = { action, protocol, src, dst }
  if (srcPort) e.srcPort = srcPort
  if (dstPort) e.dstPort = dstPort
  if (tokens.includes('established')) e.established = true
  if (tokens.includes('log')) e.log = true
  return e
}

interface Bloque { cabecera: string; lineas: string[] }

/** Divide una running-config en comandos globales con sus subcomandos indentados. */
function bloques(texto: string): Bloque[] {
  const out: Bloque[] = []
  const lineas = texto.replace(/\r/g, '').split('\n')
  for (let n = 0; n < lineas.length; n++) {
    const l = lineas[n]
    if (!l.trim()) continue
    // banner multilínea: banner motd ^C ... ^C  o  #...#
    const banner = l.match(/^banner (motd|login|exec)\s+(\^C|\S)(.*)$/)
    if (banner) {
      const delim = banner[2]
      let cuerpo = banner[3]
      while (!cuerpo.includes(delim) && n + 1 < lineas.length) cuerpo += '\n' + lineas[++n]
      out.push({ cabecera: `banner ${banner[1]}`, lineas: [cuerpo.split(delim)[0].trim()] })
      continue
    }
    if (/^\s/.test(l) && out.length) out[out.length - 1].lineas.push(l.trim())
    else out.push({ cabecera: l.trim(), lineas: [] })
  }
  return out
}

interface Parcial {
  dev: Device
  ifs: Map<string, Iface>
  orden: string[]
  extra: string[]
  mapasCrypto: Map<string, { seq: string; peer?: string; transform?: string; acl?: string }[]>
  ifacesCrypto: Map<string, string>     // interfaz → nombre de crypto map
  claves: Map<string, string>           // peer → (marcador)
  transforms: Map<string, string>
  ike?: { encryption?: string; hash?: string; group?: number; lifetime?: number }
  esSwitch: boolean
  esAsa: boolean
  nombresVlan: Map<number, string>
  costosOspf: Map<string, number>       // 'ip ospf cost' (el área sale de los network)
  dominio?: string
  usuario?: string
  ssh: boolean
}

function nuevaIface(p: Parcial, nombre: string): Iface {
  const n = normalizeIfName(nombre)
  const k = ifKey(n)
  if (!p.ifs.has(k)) { p.ifs.set(k, { name: n }); p.orden.push(k) }
  return p.ifs.get(k)!
}

function parseInterfaz(p: Parcial, b: Bloque, reporte: string[]): void {
  const rango = b.cabecera.match(/^interface range (.+)$/)
  if (rango) {
    // "interface range Fa0/1 - 10, Gi0/1 - 2" → se aplica la misma configuración a cada puerto
    for (const parte of rango[1].split(',')) {
      const m = parte.trim().match(/^(.*?)(\d+)\s*-\s*(\d+)$/)
      const nombres = m ? Array.from({ length: Number(m[3]) - Number(m[2]) + 1 }, (_, n) => `${m[1]}${Number(m[2]) + n}`) : [parte.trim()]
      for (const nombre of nombres) parseInterfaz(p, { cabecera: `interface ${nombre}`, lineas: b.lineas }, reporte)
    }
    return
  }
  const nombre = b.cabecera.replace(/^interface\s+/, '').trim()
  const i = nuevaIface(p, nombre)
  const desconocidas: string[] = []
  for (const l of b.lineas) {
    let m: RegExpMatchArray | null
    if ((m = l.match(/^description (.+)$/))) i.description = m[1]
    else if ((m = l.match(/^ip address (\S+) (\S+)( secondary)?$/))) {
      if (m[3]) desconocidas.push(l)
      else { const c = maskPrefix(m[1], m[2]); if (c) i.ip = `${m[1]}/${c.split('/')[1]}` }
    } else if (/^ip address dhcp/.test(l)) i.dhcp = true
    else if (l === 'shutdown') i.shutdown = true
    else if (l === 'no shutdown' || l === 'no ip address') { /* por defecto */ }
    else if ((m = l.match(/^switchport mode (access|trunk)$/))) { i.mode = m[1] as 'access' | 'trunk'; p.esSwitch = true }
    else if ((m = l.match(/^switchport mode dynamic (\S+)$/))) { p.esSwitch = true; reporte.push(`${p.dev.id} ${i.name}: DTP dynamic ${m[1]} (el modo efectivo depende del vecino; revise).`) }
    else if ((m = l.match(/^switchport access vlan (\d+)$/))) { i.vlan = Number(m[1]); p.esSwitch = true }
    else if ((m = l.match(/^switchport trunk native vlan (\d+)$/))) i.nativeVlan = Number(m[1])
    else if ((m = l.match(/^switchport trunk allowed vlan (add |remove |except )?(.+)$/))) {
      const lista = m[2] === 'all' ? 'all' : m[2] === 'none' ? [] : vlanList(m[2])
      if (!m[1]) i.allowedVlans = lista
      else if (m[1] === 'add ' && Array.isArray(lista)) i.allowedVlans = [...new Set([...(Array.isArray(i.allowedVlans) ? i.allowedVlans : []), ...lista])].sort((a, b) => a - b)
      else desconocidas.push(l)
    } else if ((m = l.match(/^switchport voice vlan (\d+)$/))) i.voiceVlan = Number(m[1])
    else if (/^switchport trunk encapsulation|^switchport nonegotiate|^switchport$/.test(l)) p.esSwitch = true
    else if (l === 'no switchport') { i.mode = 'routed'; p.esSwitch = true }
    else if (l === 'switchport port-security') i.portSecurity = i.portSecurity ?? {}
    else if ((m = l.match(/^switchport port-security maximum (\d+)$/))) i.portSecurity = { ...i.portSecurity, maximum: Number(m[1]) }
    else if ((m = l.match(/^switchport port-security violation (\S+)$/))) i.portSecurity = { ...i.portSecurity, violation: m[1] as 'shutdown' }
    else if (l === 'switchport port-security mac-address sticky') i.portSecurity = { ...i.portSecurity, sticky: true }
    else if ((m = l.match(/^switchport port-security mac-address (?:sticky )?([0-9a-fA-F.]{14})$/))) i.portSecurity = { ...i.portSecurity, macs: [...(i.portSecurity?.macs ?? []), m[1]] }
    else if (/^spanning-tree portfast/.test(l)) i.portfast = true
    else if (l === 'spanning-tree bpduguard enable') i.bpduguard = true
    else if ((m = l.match(/^spanning-tree cost (\d+)$/))) i.stp = { ...i.stp, cost: Number(m[1]) }
    else if ((m = l.match(/^spanning-tree port-priority (\d+)$/))) i.stp = { ...i.stp, portPriority: Number(m[1]) }
    else if ((m = l.match(/^channel-group (\d+) mode (\S+)$/))) i.channelGroup = { id: Number(m[1]), mode: m[2] as 'active' }
    else if ((m = l.match(/^encapsulation dot1Q (\d+)( native)?$/i))) { i.vlan = Number(m[1]); if (m[2]) i.native = true }
    else if ((m = l.match(/^ip helper-address (\S+)$/))) i.helper = [...(i.helper ?? []), m[1]]
    else if ((m = l.match(/^ip nat (inside|outside)$/))) i.nat = m[1] as 'inside' | 'outside'
    else if ((m = l.match(/^ip access-group (\S+) (in|out)$/))) i.acl = { ...i.acl, [m[2]]: m[1] }
    else if ((m = l.match(/^ip ospf cost (\d+)$/))) p.costosOspf.set(i.name, Number(m[1]))
    else if ((m = l.match(/^ip ospf \d+ area (\S+)$/))) i.ospf = { ...i.ospf, area: /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] }
    else if ((m = l.match(/^ipv6 address (\S+) link-local$/))) i.linkLocal = m[1]
    else if ((m = l.match(/^ipv6 address (\S+\/\d+)$/))) i.ipv6 = [...(i.ipv6 ?? []), m[1]]
    else if ((m = l.match(/^ipv6 ospf \d+ area (\S+)$/))) i.ospfv3 = { ...i.ospfv3, area: /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] }
    else if ((m = l.match(/^ipv6 ospf cost (\d+)$/))) i.ospfv3 = { area: i.ospfv3?.area ?? 0, ...i.ospfv3, cost: Number(m[1]) }
    else if (l === 'standby version 2') i.hsrp = { group: i.hsrp?.group ?? 0, ip: i.hsrp?.ip ?? '', ...i.hsrp, version: 2 }
    else if ((m = l.match(/^standby (?:(\d+) )?ip (\S+)$/))) i.hsrp = { ...i.hsrp, group: Number(m[1] ?? 0), ip: m[2] }
    else if ((m = l.match(/^standby (?:(\d+) )?priority (\d+)$/))) i.hsrp = { group: Number(m[1] ?? 0), ip: i.hsrp?.ip ?? '', ...i.hsrp, priority: Number(m[2]) }
    else if ((m = l.match(/^standby (?:(\d+) )?preempt/))) i.hsrp = { group: Number(m[1] ?? 0), ip: i.hsrp?.ip ?? '', ...i.hsrp, preempt: true }
    else if ((m = l.match(/^clock rate (\d+)$/))) i.clockRate = Number(m[1])
    else if ((m = l.match(/^bandwidth (\d+)$/))) i.bandwidth = Number(m[1])
    else if ((m = l.match(/^speed (\S+)$/))) { if (m[1] !== 'auto') i.speed = m[1] }
    else if ((m = l.match(/^duplex (auto|full|half)$/))) { if (m[1] !== 'auto') i.duplex = m[1] as 'full' }
    else if ((m = l.match(/^crypto map (\S+)$/))) p.ifacesCrypto.set(i.name, m[1])
    else if ((m = l.match(/^nameif (\S+)$/))) { i.nameif = m[1]; p.esAsa = true }
    else if ((m = l.match(/^security-level (\d+)$/))) i.securityLevel = Number(m[1])
    else desconocidas.push(l)
  }
  if (desconocidas.length) p.extra.push(`interface ${i.name}`, ...desconocidas.map((x) => ` ${x}`), 'exit')
}

/** Extrae solo la running-config (desde su inicio hasta "end"), sin prompts ni otras salidas. */
function soloConfig(texto: string): string {
  const lineas = texto.replace(/\r/g, '').split('\n')
  const ini = lineas.findIndex((l) => /^(Building configuration|Current configuration|version |hostname |: Saved|ASA Version)/.test(l))
  if (ini < 0) return ''
  const finRel = lineas.slice(ini).findIndex((l) => /^end\s*$/.test(l))
  const fin = finRel < 0 ? lineas.length : ini + finRel
  return lineas.slice(ini, fin).filter((l) => !/^\S+[#>]\s*\S/.test(l)).join('\n')
}

function parseDevice(texto: string, nombreArchivo: string, reporte: string[]): Parcial | null {
  const bs = bloques(soloConfig(texto))
  const host = bs.find((b) => /^hostname \S+/.test(b.cabecera))?.cabecera.split(/\s+/)[1]
  if (!host) return null
  const p: Parcial = {
    dev: { id: host, type: 'router', interfaces: [] }, ifs: new Map(), orden: [], extra: [],
    mapasCrypto: new Map(), ifacesCrypto: new Map(), claves: new Map(), transforms: new Map(), esSwitch: false, esAsa: /ASA Version/i.test(texto),
    nombresVlan: new Map(), costosOspf: new Map(), ssh: false,
  }
  const d = p.dev
  const acls = new Map<string, Acl>()
  const aclDe = (nombre: string, tipo: 'standard' | 'extended'): Acl => {
    if (!acls.has(nombre)) acls.set(nombre, { name: nombre, type: tipo, entries: [] })
    return acls.get(nombre)!
  }
  const routing = (): NonNullable<Device['routing']> => (d.routing ??= {})
  const services = (): NonNullable<Device['services']> => (d.services ??= {})
  const security = (): NonNullable<Device['security']> => (d.security ??= {})
  let secretos = 0
  for (const b of bs) {
    const c = b.cabecera
    let m: RegExpMatchArray | null
    if (IGNORAR.some((r) => r.test(c))) continue
    if (/^hostname /.test(c)) continue
    if (/^interface /.test(c)) { parseInterfaz(p, b, reporte); continue }
    if (c === 'ip routing') { routing().ipRouting = true; p.esSwitch = true; continue }
    if (c === 'ipv6 unicast-routing') continue
    if ((m = c.match(/^vlan ([\d,-]+)$/))) {
      const ids = vlanList(m[1])
      d.vlans = [...new Set([...(d.vlans ?? []), ...ids])]
      const nombre = b.lineas.find((l) => l.startsWith('name '))?.slice(5)
      if (nombre && ids.length === 1) p.nombresVlan.set(ids[0], nombre)
      p.esSwitch = true
      continue
    }
    if ((m = c.match(/^ip route (\S+) (\S+) (\S+)(?: (\S+))?(?: (\d+))?$/))) {
      const pref = maskPrefix(m[1], m[2])
      if (!pref) { p.extra.push(c); continue }
      const r: NonNullable<NonNullable<Device['routing']>['static']>[number] = { prefix: pref }
      if (/^\d+\.\d+\.\d+\.\d+$/.test(m[3])) { r.nextHop = m[3]; if (m[4] && /^\d+$/.test(m[4])) r.ad = Number(m[4]) }
      else { r.exitInterface = normalizeIfName(m[3]); if (m[4] && /^\d+\.\d+/.test(m[4])) r.nextHop = m[4]; else if (m[4]) r.ad = Number(m[4]) }
      if (m[5]) r.ad = Number(m[5])
      ;(routing().static ??= []).push(r)
      continue
    }
    if ((m = c.match(/^route (\S+) (\S+) (\S+) (\S+)(?: (\d+))?$/)) && p.esAsa) {
      const pref = maskPrefix(m[2], m[3])
      if (pref) { (routing().static ??= []).push({ prefix: pref, nextHop: m[4], ...(m[5] && m[5] !== '1' ? { ad: Number(m[5]) } : {}) }); continue }
    }
    if ((m = c.match(/^ipv6 route (\S+) (\S+)(?: (\S+))?$/))) {
      const r: { prefix: string; nextHop?: string; exitInterface?: string } = { prefix: m[1] }
      if (m[2].includes(':')) r.nextHop = m[2]; else { r.exitInterface = normalizeIfName(m[2]); if (m[3]) r.nextHop = m[3] }
      ;(routing().ipv6Static ??= []).push(r)
      continue
    }
    if ((m = c.match(/^router ospf (\d+)$/))) {
      const o: NonNullable<NonNullable<Device['routing']>['ospf']> = { processId: Number(m[1]) }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^router-id (\S+)$/))) o.routerId = x[1]
        else if ((x = l.match(/^network (\S+) (\S+) area (\S+)$/))) { const pref = wildcardToPrefix(x[1], x[2]); if (pref) (o.networks ??= []).push({ prefix: pref, area: /^\d+$/.test(x[3]) ? Number(x[3]) : x[3] }) }
        else if ((x = l.match(/^passive-interface (\S+)$/))) (o.passiveInterfaces ??= []).push(normalizeIfName(x[1]))
        else if (/^default-information originate/.test(l)) o.defaultOriginate = true
        else if ((x = l.match(/^auto-cost reference-bandwidth (\d+)$/))) o.referenceBandwidth = Number(x[1])
        else if (!/^log-adjacency-changes/.test(l)) p.extra.push(`router ospf ${m[1]}`, ` ${l}`, 'exit')
      }
      routing().ospf = o
      continue
    }
    if ((m = c.match(/^ipv6 router ospf (\d+)$/))) {
      const o: NonNullable<NonNullable<Device['routing']>['ospfv3']> = { processId: Number(m[1]) }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^router-id (\S+)$/))) o.routerId = x[1]
        else if ((x = l.match(/^passive-interface (\S+)$/))) (o.passiveInterfaces ??= []).push(normalizeIfName(x[1]))
        else if (/^default-information originate/.test(l)) o.defaultOriginate = true
      }
      routing().ospfv3 = o
      continue
    }
    if ((m = c.match(/^router eigrp (\d+)$/))) {
      const e: NonNullable<NonNullable<Device['routing']>['eigrp']> = { as: Number(m[1]), networks: [] }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^network (\S+)(?: (\S+))?$/))) e.networks!.push(x[2] ? wildcardToPrefix(x[1], x[2]) ?? x[1] : x[1])
        else if ((x = l.match(/^passive-interface (\S+)$/))) (e.passiveInterfaces ??= []).push(normalizeIfName(x[1]))
        else if ((x = l.match(/^eigrp router-id (\S+)$/))) e.routerId = x[1]
        else if (l !== 'no auto-summary') p.extra.push(`router eigrp ${m[1]}`, ` ${l}`, 'exit')
      }
      routing().eigrp = e
      continue
    }
    if (c === 'router rip') {
      const r: NonNullable<NonNullable<Device['routing']>['rip']> = { networks: [] }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^version (\d)$/))) r.version = Number(x[1]) as 1 | 2
        else if ((x = l.match(/^network (\S+)$/))) r.networks!.push(x[1])
        else if ((x = l.match(/^passive-interface (\S+)$/))) (r.passiveInterfaces ??= []).push(normalizeIfName(x[1]))
        else if (/^default-information originate/.test(l)) r.defaultOriginate = true
        else if (l === 'no auto-summary') r.noAutoSummary = true
      }
      routing().rip = r
      continue
    }
    if ((m = c.match(/^router bgp (\d+)$/))) {
      const g: NonNullable<NonNullable<Device['routing']>['bgp']> = { as: Number(m[1]), neighbors: [] }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^bgp router-id (\S+)$/))) g.routerId = x[1]
        else if ((x = l.match(/^neighbor (\S+) remote-as (\d+)$/))) g.neighbors.push({ ip: x[1], remoteAs: Number(x[2]) })
        else if ((x = l.match(/^network (\S+) mask (\S+)$/))) { const pref = maskPrefix(x[1], x[2]); if (pref) (g.networks ??= []).push(pref) }
        else if ((x = l.match(/^network (\S+)$/))) (g.networks ??= []).push(x[1])
        else if (!/^bgp log-neighbor-changes/.test(l)) p.extra.push(`router bgp ${m[1]}`, ` ${l}`, 'exit')
      }
      routing().bgp = g
      continue
    }
    if ((m = c.match(/^ip dhcp excluded-address (\S+)(?: (\S+))?$/))) { ((services().dhcp ??= { pools: [] }).excluded ??= []).push({ from: m[1], ...(m[2] ? { to: m[2] } : {}) }); continue }
    if ((m = c.match(/^ip dhcp pool (\S+)$/))) {
      const pool: { name: string; network: string; defaultRouter?: string; dns?: string[]; domain?: string; leaseDays?: number } = { name: m[1], network: '' }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^network (\S+) (\S+)$/))) pool.network = maskPrefix(x[1], x[2]) ?? ''
        else if ((x = l.match(/^network (\S+)\s*\/(\d+)$/))) pool.network = `${x[1]}/${x[2]}`
        else if ((x = l.match(/^default-router (\S+)/))) pool.defaultRouter = x[1]
        else if ((x = l.match(/^dns-server (.+)$/))) pool.dns = x[1].split(/\s+/)
        else if ((x = l.match(/^domain-name (\S+)$/))) pool.domain = x[1]
        else if ((x = l.match(/^lease (\d+)/))) pool.leaseDays = Number(x[1])
      }
      if (pool.network) (services().dhcp ??= { pools: [] }).pools.push(pool)
      else reporte.push(`${host}: pool DHCP ${m[1]} sin "network" (posible pool manual); no importado.`)
      continue
    }
    if ((m = c.match(/^ip nat inside source list (\S+) interface (\S+) overload$/))) {
      const n = (services().nat ??= {})
      n.aclName = m[1]; n.overloadInterface = normalizeIfName(m[2])
      continue
    }
    if ((m = c.match(/^ip nat inside source static (\S+) (\S+)$/))) { ((services().nat ??= {}).static ??= []).push({ inside: m[1], outside: m[2] }); continue }
    if ((m = c.match(/^ip nat pool (\S+) (\S+) (\S+) netmask (\S+)$/))) {
      ;(services().nat ??= {}).pool = { name: m[1], start: m[2], end: m[3], prefix: maskToPrefix(m[4]) ?? 24 }
      continue
    }
    if ((m = c.match(/^ip nat inside source list (\S+) pool (\S+)( overload)?$/))) {
      const n = (services().nat ??= {})
      n.aclName = m[1]
      if (n.pool && m[3]) n.pool.overload = true
      continue
    }
    if ((m = c.match(/^access-list (\d+) (.+)$/))) {
      const num = Number(m[1])
      const tipo = num < 100 || (num >= 1300 && num <= 1999) ? 'standard' : 'extended'
      const e = parseAclEntry(m[2], tipo, false)
      if (e) aclDe(m[1], tipo).entries.push(e); else p.extra.push(c)
      continue
    }
    if ((m = c.match(/^access-list (\S+) (extended|standard) (.+)$/)) && p.esAsa) {
      const e = parseAclEntry(m[3], m[2] as 'extended', true)
      if (e) aclDe(m[1], m[2] as 'extended').entries.push(e); else p.extra.push(c)
      continue
    }
    if ((m = c.match(/^access-list (\S+) remark (.+)$/)) && p.esAsa) { aclDe(m[1], 'extended').entries.push({ action: 'remark', text: m[2] }); continue }
    if ((m = c.match(/^access-group (\S+) (in|out) interface (\S+)$/))) {
      const i = [...p.ifs.values()].find((x) => x.nameif === m![3])
      if (i) i.acl = { ...i.acl, [m[2]]: m[1] }; else p.extra.push(c)
      continue
    }
    if ((m = c.match(/^ip access-list (standard|extended) (\S+)$/))) {
      const acl = aclDe(m[2], m[1] as 'standard')
      for (const l of b.lineas) { const e = parseAclEntry(l, m[1] as 'standard', false); if (e) acl.entries.push(e) }
      continue
    }
    if ((m = c.match(/^spanning-tree mode (\S+)$/))) { d.stp = { ...d.stp, mode: m[1] as 'rapid-pvst' }; continue }
    if ((m = c.match(/^spanning-tree vlan ([\d,-]+) root (primary|secondary)$/))) {
      const k = m[2] === 'primary' ? 'rootPrimary' : 'rootSecondary'
      d.stp = { ...d.stp, [k]: [...(d.stp?.[k] ?? []), ...vlanList(m[1])] }
      continue
    }
    if ((m = c.match(/^spanning-tree vlan ([\d,-]+) priority (\d+)$/))) { d.stp = { ...d.stp, priorities: [...(d.stp?.priorities ?? []), { vlans: vlanList(m[1]), priority: Number(m[2]) }] }; continue }
    if ((m = c.match(/^ip default-gateway (\S+)$/))) { d.gateway = m[1]; continue }
    if (/^enable (secret|password)/.test(c)) { security().enableSecret = SECRETO; secretos++; continue }
    if (c === 'service password-encryption') { security().servicePasswordEncryption = true; continue }
    if ((m = c.match(/^banner motd$/))) { security().banner = b.lineas[0]; continue }
    if ((m = c.match(/^(?:ip )?domain-name (\S+)$/))) { p.dominio = m[1]; continue }
    if ((m = c.match(/^username (\S+) /))) { p.usuario = m[1]; secretos++; continue }
    if (/^ip ssh version 2|^ssh version 2|^crypto key generate/.test(c)) { p.ssh = true; continue }
    if ((m = c.match(/^ntp server (\S+)/))) { services().ntpServer = m[1]; continue }
    if ((m = c.match(/^logging (?:host )?(\d+\.\d+\.\d+\.\d+)$/))) { services().syslogServer = m[1]; continue }
    if ((m = c.match(/^snmp-server community \S+ (RO|RW)/i))) { services().snmp = { community: '<COMUNIDAD>', mode: m[1].toLowerCase() as 'ro' }; secretos++; continue }
    if ((m = c.match(/^vtp mode (\S+)$/))) { d.vtpMode = m[1] as 'transparent'; continue }
    if ((m = c.match(/^crypto isakmp policy \d+$/))) {
      if (!p.ike) {
        p.ike = {}
        for (const l of b.lineas) {
          let x: RegExpMatchArray | null
          if ((x = l.match(/^encr(?:yption)? (.+)$/))) p.ike.encryption = x[1]
          else if ((x = l.match(/^hash (\S+)$/))) p.ike.hash = x[1]
          else if ((x = l.match(/^group (\d+)$/))) p.ike.group = Number(x[1])
          else if ((x = l.match(/^lifetime (\d+)$/))) p.ike.lifetime = Number(x[1])
        }
      }
      continue
    }
    if ((m = c.match(/^crypto isakmp key \S+ address (\S+)/))) { p.claves.set(m[1], SECRETO); secretos++; continue }
    if ((m = c.match(/^crypto ipsec transform-set (\S+) (.+)$/))) { p.transforms.set(m[1], m[2].replace(/\s+$/, '')); continue }
    if ((m = c.match(/^crypto map (\S+) (\d+) ipsec-isakmp$/))) {
      const e: { seq: string; peer?: string; transform?: string; acl?: string } = { seq: m[2] }
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if ((x = l.match(/^set peer (\S+)$/))) e.peer = x[1]
        else if ((x = l.match(/^set transform-set (\S+)$/))) e.transform = x[1]
        else if ((x = l.match(/^match address (\S+)$/))) e.acl = x[1]
      }
      p.mapasCrypto.set(m[1], [...(p.mapasCrypto.get(m[1]) ?? []), e])
      continue
    }
    if ((m = c.match(/^line (con|console|vty) /))) {
      for (const l of b.lineas) {
        let x: RegExpMatchArray | null
        if (/^password /.test(l)) { if (m[1] === 'vty') security().vtyPassword = SECRETO; else security().consolePassword = SECRETO; secretos++ }
        else if ((x = l.match(/^access-class (\S+) in$/))) security().vtyAcl = x[1]
      }
      continue
    }
    if (/^ssh \d/.test(c) || /^aaa authentication ssh/.test(c)) { p.ssh = true; continue }
    p.extra.push(c, ...b.lineas.map((l) => ` ${l}`))
  }
  // 'ip ospf cost': el área se toma del network que cubre la interfaz
  for (const [nombre, costo] of p.costosOspf) {
    const i = p.ifs.get(ifKey(nombre))!
    const c = i.ip ? parseCidr4(i.ip) : null
    const red = c ? d.routing?.ospf?.networks?.find((n) => { const x = parseCidr4(n.prefix); return !!x && networkOf(c.ip, x.prefix) === x.ip }) : undefined
    i.ospf = { ...i.ospf, area: i.ospf?.area ?? red?.area ?? 0, cost: costo }
    if (!red && i.ospf.area === 0 && !d.routing?.ospf) reporte.push(`${host} ${nombre}: "ip ospf cost" sin proceso OSPF; revise el área.`)
  }
  if (p.ssh) security().ssh = { domain: p.dominio ?? 'local', username: p.usuario ?? 'admin', password: SECRETO }
  if (acls.size) d.acls = [...acls.values()]
  // NAT: fuentes desde la ACL usada por "ip nat inside source list"
  const nat = d.services?.nat
  if (nat?.aclName && acls.has(nat.aclName)) {
    const acl = acls.get(nat.aclName)!
    const fuentes = acl.entries.filter((e) => e.action === 'permit' && e.src && e.src !== 'any').map((e) => e.src!.replace(/^host (\S+)$/, '$1/32'))
    if (fuentes.length) nat.insideSources = fuentes
    if (acl.entries.some((e) => e.action === 'deny')) reporte.push(`${host}: la ACL de NAT ${nat.aclName} tiene "deny" (p. ej. exención de VPN); se regenerará automáticamente si hay VPN.`)
    d.acls = d.acls!.filter((a) => a.name !== nat.aclName)
    if (!d.acls.length) delete d.acls
  }
  // VPN: crypto map + ACL espejo
  for (const [ifName, mapa] of p.ifacesCrypto) {
    for (const e of p.mapasCrypto.get(mapa) ?? []) {
      const acl = e.acl ? acls.get(e.acl) : undefined
      if (!e.peer || !acl) { reporte.push(`${host}: crypto map ${mapa} ${e.seq} incompleto; no importado.`); continue }
      const permisos = acl.entries.filter((x) => x.action === 'permit')
      const t: IpsecTunnel = {
        name: e.acl!.replace(/^VPN-/, ''), peer: e.peer, localInterface: ifName, psk: p.claves.get(e.peer) ?? SECRETO,
        localNetworks: [...new Set(permisos.map((x) => x.src!).filter(Boolean))], remoteNetworks: [...new Set(permisos.map((x) => x.dst!).filter(Boolean))],
      }
      if (p.ike) t.ike = p.ike
      if (e.transform && p.transforms.get(e.transform)) t.transform = p.transforms.get(e.transform)
      ;(d.vpn ??= { siteToSite: [] }).siteToSite.push(t)
      d.acls = d.acls?.filter((a) => a.name !== e.acl)
      if (d.acls && !d.acls.length) delete d.acls
    }
  }
  // Tipo de equipo
  const svisConIp = [...p.ifs.values()].filter((i) => /^vlan\d+$/i.test(i.name) && i.ip).length
  let tipo: DeviceType = 'router'
  let plataforma: Platform | undefined
  if (p.esAsa) { tipo = 'firewall'; plataforma = 'asa' }
  else if (p.esSwitch) tipo = d.routing?.ipRouting || [...p.ifs.values()].some((i) => i.mode === 'routed') || svisConIp > 1 ? 'l3switch' : 'switch'
  if (tipo === 'switch' && d.routing && !d.routing.static && !d.routing.ospf && !d.routing.eigrp && !d.routing.rip) delete d.routing
  d.type = tipo
  if (tipo !== 'switch' && tipo !== 'l3switch') delete d.stp       // PT incluye "spanning-tree mode" también en routers
  if (plataforma) d.platform = plataforma
  else if (tipo === 'router' && [...p.ifs.values()].some((i) => /^gigabitethernet\d+\/\d+\/\d+$/i.test(i.name))) {
    reporte.push(`${host}: interfaces con formato slot/subslot/puerto → probablemente IOS XE (ISR 4000). Indique "model".`)
  }
  // Interfaces: descartar puertos de router apagados y sin configuración; agrupar puertos de switch idénticos en rangos
  let lista = p.orden.map((k) => p.ifs.get(k)!)
  if (tipo !== 'switch' && tipo !== 'l3switch') lista = lista.filter((i) => Object.keys(i).length > 2 || !i.shutdown)
  d.interfaces = agruparRangos(lista)
  if (p.extra.length) d.extraConfig = p.extra
  reporte.push(`${host}: importado como ${tipo}${plataforma ? ` (${plataforma})` : ''} desde ${nombreArchivo} · ${d.interfaces.length} interfaces/rangos${secretos ? ` · ${secretos} secreto(s) reemplazado(s) por ${SECRETO}` : ''}${p.extra.length ? ` · ${p.extra.length} línea(s) en extraConfig` : ''}`)
  return p
}

/** Agrupa interfaces consecutivas con configuración idéntica: FastEthernet0/1..10 → "FastEthernet0/1-10". */
function agruparRangos(lista: Iface[]): Iface[] {
  const out: Iface[] = []
  const firma = (i: Iface): string => JSON.stringify({ ...i, name: undefined })
  for (let n = 0; n < lista.length;) {
    const i = lista[n]
    const m = i.name.match(/^(.*?)(\d+)$/)
    let j = n
    if (m && !i.ip && !i.name.includes('.') && !/^(vlan|loopback|port-channel|tunnel)/i.test(i.name)) {
      while (j + 1 < lista.length) {
        const sig = lista[j + 1].name.match(/^(.*?)(\d+)$/)
        if (!sig || sig[1] !== m[1] || Number(sig[2]) !== Number(m[2]) + (j + 1 - n) || firma(lista[j + 1]) !== firma(i)) break
        j++
      }
    }
    if (j > n) out.push({ ...i, name: `${m![1]}${m![2]}-${Number(m![2]) + (j - n)}` })
    else out.push(i)
    n = j + 1
  }
  return out
}

interface Vecino { local: string; localIf: string; remoto: string; remotoIf: string; plataforma?: string; ip?: string; capacidades?: string }

/** Extrae vecinos de "show cdp neighbors detail" y "show cdp neighbors". */
function parseCdp(texto: string, hostDefecto: string | undefined): Vecino[] {
  const out: Vecino[] = []
  const lineas = texto.replace(/\r/g, '').split('\n')
  let local = hostDefecto
  let actual: Partial<Vecino> = {}
  let enTabla = false
  const cerrar = (): void => {
    if (actual.remoto && actual.localIf && actual.remotoIf && local) out.push({ ...actual, local } as Vecino)
    actual = {}
  }
  for (const l of lineas) {
    let m: RegExpMatchArray | null
    if ((m = l.match(/^(\S+?)[>#]\s*(?:sh|show)\s+cdp\s+nei/i))) { cerrar(); local = m[1]; enTabla = false; continue }
    if ((m = l.match(/^Device ID:\s*(\S+)/))) { cerrar(); actual.remoto = m[1].split('.')[0]; enTabla = false; continue }
    if ((m = l.match(/^\s*IP(?:v4)? [Aa]ddress:\s*(\S+)/)) && !actual.ip) { actual.ip = m[1]; continue }
    if ((m = l.match(/^Platform:\s*([^,]+),\s*Capabilities:\s*(.+)$/))) { actual.plataforma = m[1].trim(); actual.capacidades = m[2].trim(); continue }
    if ((m = l.match(/^Interface:\s*([^,]+),\s*Port ID \(outgoing port\):\s*(.+)$/))) { actual.localIf = normalizeIfName(m[1].trim()); actual.remotoIf = normalizeIfName(m[2].trim()); continue }
    if (/^Device ID\s+Local Intrfce/i.test(l)) { cerrar(); enTabla = true; continue }
    if (enTabla && (m = l.match(/^(\S+)\s+((?:Fas|Gig|Ten|Ser|Eth|Fa|Gi|Te|Se)\S*\s*[\d/.]+)\s+\d+\s+(.+?)\s+((?:Fas|Gig|Ten|Ser|Eth|Fa|Gi|Te|Se)\S*\s*[\d/.]+)\s*$/i))) {
      const resto = m[3].trim().split(/\s+/)
      out.push({ local: local ?? '', localIf: normalizeIfName(m[2].replace(/\s+/g, '')), remoto: m[1].split('.')[0], remotoIf: normalizeIfName(m[4].replace(/\s+/g, '')), plataforma: resto[resto.length - 1] })
    }
  }
  cerrar()
  return out.filter((v) => v.local)
}

function tipoPorCdp(v: Vecino): DeviceType {
  const c = `${v.capacidades ?? ''} ${v.plataforma ?? ''}`
  if (/ASA/i.test(c)) return 'firewall'
  if (/Router/.test(c) && /Switch/.test(c)) return 'l3switch'
  if (/Router|\b(19|29|43|44)\d\d\b|ISR/i.test(c)) return 'router'
  if (/Switch|\b(29|35|36|37|38|93)\d\d\b/i.test(c)) return 'switch'
  if (/Phone/i.test(c)) return 'phone'
  return 'other'
}

export function importConfigs(files: ImportFile[], nombreRed?: string): ImportResult {
  const reporte: string[] = []
  const parciales = new Map<string, Parcial>()
  const vecinos: Vecino[] = []
  for (const f of files) {
    const p = parseDevice(f.text, f.name, reporte)
    if (p) {
      if (parciales.has(p.dev.id)) reporte.push(`Aviso: ${p.dev.id} aparece en más de un archivo; se usa el último (${f.name}).`)
      parciales.set(p.dev.id, p)
    }
    const cdp = parseCdp(f.text, p?.dev.id)
    vecinos.push(...cdp)
    if (!p && !cdp.length) reporte.push(`${f.name}: no se encontró "hostname" ni salida de CDP; ignorado.`)
  }
  const devices: Device[] = [...parciales.values()].map((p) => p.dev)
  const porId = new Map(devices.map((d) => [d.id, d]))
  // VLAN globales a partir de las bases VLAN de los switches
  const vlans = new Map<number, string>()
  for (const p of parciales.values()) {
    for (const v of p.dev.vlans ?? []) if (v !== 1 && !vlans.has(v)) vlans.set(v, p.nombresVlan.get(v) ?? `VLAN${String(v).padStart(4, '0')}`)
    delete p.dev.vlans
  }
  // Enlaces: CDP (confirmados) y P2P /30-/31 inferidos
  const links: Link[] = []
  const vistos = new Set<string>()
  const asegurarIface = (d: Device, nombre: string): void => {
    const k = ifKey(nombre)
    const existe = d.interfaces.some((i) => ifKey(i.name) === k || (/-\d+$/.test(i.name) && rangoContiene(i.name, nombre)))
    if (!existe) d.interfaces.push({ name: normalizeIfName(nombre) })
  }
  for (const v of vecinos) {
    let remoto = porId.get(v.remoto)
    if (!remoto) {
      remoto = { id: v.remoto, type: tipoPorCdp(v), model: v.plataforma?.replace(/^cisco\s+/i, ''), confidence: 'inferred', notes: 'Creado a partir de CDP (no se importó su configuración).', interfaces: [] }
      if (v.ip) remoto.notes += ` IP de gestión según CDP: ${v.ip}.`
      devices.push(remoto); porId.set(remoto.id, remoto)
      reporte.push(`${v.remoto}: no hay configuración; creado desde CDP como ${remoto.type} (inferido).`)
    }
    const local = porId.get(v.local)
    if (!local) continue
    asegurarIface(local, v.localIf)
    asegurarIface(remoto, v.remotoIf)
    const k = [`${v.local}:${ifKey(v.localIf)}`, `${v.remoto}:${ifKey(v.remotoIf)}`].sort().join('|')
    if (vistos.has(k)) continue
    vistos.add(k)
    links.push({ a: `${v.local}:${normalizeIfName(v.localIf)}`, b: `${v.remoto}:${normalizeIfName(v.remotoIf)}`, ...(/^serial/i.test(v.localIf) ? { medium: 'serial' as const } : {}) })
  }
  const conectadas = new Set(links.flatMap((l) => [l.a, l.b].map((x) => { const [dd, ii] = x.split(':'); return `${dd}:${ifKey(ii)}` })))
  const p2p = new Map<string, { dev: string; iface: string }[]>()
  for (const d of devices) {
    for (const i of d.interfaces) {
      const c = i.ip ? parseCidr4(i.ip) : null
      if (!c || c.prefix < 30 || /^(vlan|loopback|tunnel)/i.test(i.name) || i.name.includes('.')) continue
      if (conectadas.has(`${d.id}:${ifKey(i.name)}`)) continue
      const k = cidrKey(c)
      p2p.set(k, [...(p2p.get(k) ?? []), { dev: d.id, iface: i.name }])
    }
  }
  for (const [red, ms] of p2p) {
    if (ms.length !== 2) continue
    links.push({ a: `${ms[0].dev}:${ms[0].iface}`, b: `${ms[1].dev}:${ms[1].iface}`, confidence: 'inferred', ...(/^serial/i.test(ms[0].iface) ? { medium: 'serial' as const } : {}), notes: `Inferido por la subred punto a punto ${red}` })
    reporte.push(`Enlace inferido ${ms[0].dev} ${ms[0].iface} ↔ ${ms[1].dev} ${ms[1].iface} (misma subred ${red}); confirme con CDP.`)
  }
  devices.sort((a, b) => naturalCompare(a.id, b.id))
  const model: NetworkModel = {
    modelVersion: MODEL_VERSION,
    meta: { name: nombreRed ?? 'Red importada', description: `Importada desde ${files.length} archivo(s) de configuración. Revise lo marcado como inferido y los marcadores ${SECRETO}.`, target: 'ios', language: 'es' },
    vlans: [...vlans].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name })),
    devices,
    links,
  }
  if (!model.vlans!.length) delete model.vlans
  if (!links.length) reporte.push('Sin enlaces: agregue salidas de "show cdp neighbors detail" (con el prompt del equipo) para importar el cableado.')
  reporte.push('Los hosts (PC, servidores) no tienen running-config: agréguelos al modelo a mano si los necesita.')
  return { model, report: reporte }
}

function rangoContiene(rango: string, nombre: string): boolean {
  const m = rango.match(/^(.*?)(\d+)-(\d+)$/)
  const n = normalizeIfName(nombre).match(/^(.*?)(\d+)$/)
  return !!m && !!n && m[1] === n[1] && Number(n[2]) >= Number(m[2]) && Number(n[2]) <= Number(m[3])
}
