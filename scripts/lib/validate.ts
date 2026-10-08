// Orchestrates the full model analysis: structure, L2, addressing, DHCP, routing,
// ACL/NAT, security and tests. Every artifact (diagram, configs, docs) is built from this result.

import type { DeviceType, Diagnostic, NetworkModel } from './model.ts'
import { HOST_TYPES, MODEL_VERSION } from './model.ts'
import type { NDevice, NIface } from './normalize.ts'
import { findIface, ifUp, normalizeModel } from './normalize.ts'
import type { ResolvedLink, Segment } from './l2.ts'
import { checkL2, computeSegments, resolveLinks } from './l2.ts'
import type { L3Context, Route } from './l3.ts'
import { buildRouteTables, computeHsrp, newContext, routesDevice } from './l3.ts'
import type { TraceResult } from './trace.ts'
import { isAsa, tracePing } from './trace.ts'
import type { Route6 } from './l3v6.ts'
import { buildRoute6Tables, checkIpv6 } from './l3v6.ts'
import type { StpResult } from './stp.ts'
import { computeStp } from './stp.ts'
import { checkAsa, checkVpn } from './security-checks.ts'
import { checkSchema } from './schema.ts'
import { cidrKey, containsIp, formatIpv4, networkOf, overlaps, broadcastOf, parseAclAddress, parseCidr4, parseIpv4 } from './ip.ts'
import { interfaceExists, lookupModel } from './catalog.ts'

const TIPOS_VALIDOS: DeviceType[] = [
  'router', 'switch', 'l3switch', 'firewall', 'wlc', 'ap', 'wireless-router', 'pc', 'laptop', 'server', 'printer',
  'phone', 'tablet', 'smartphone', 'iot', 'cloud', 'internet', 'modem', 'hub', 'other',
]
const SECRETOS_DEBILES = new Set(['cisco', 'class', 'password', '123', '1234', '12345', 'admin', 'cisco123'])

export interface TestResult extends TraceResult { expect: 'success' | 'fail'; passed: boolean | null; description?: string }

export interface Analysis {
  model: NetworkModel
  devices: Map<string, NDevice>
  links: ResolvedLink[]
  segments: Segment[]
  segmentOf: Map<string, Segment>
  vlanDevices: Map<number, Set<string>>
  ctx: L3Context
  tables6: Map<string, Route6[]>
  stp: StpResult
  tests: TestResult[]
  diagnostics: Diagnostic[]
  counts: { error: number; warning: number; info: number }
}

function checkStructure(model: NetworkModel, diags: Diagnostic[]): boolean {
  if (!model || typeof model !== 'object') {
    diags.push({ severity: 'error', code: 'MODEL-INVALID', message: 'The file does not contain a JSON model object.' })
    return false
  }
  if (model.modelVersion !== MODEL_VERSION) {
    diags.push({ severity: 'warning', code: 'MODEL-VERSION', message: `modelVersion is ${model.modelVersion}; this tool expects ${MODEL_VERSION}.` })
  }
  if (!model.meta?.name) diags.push({ severity: 'warning', code: 'META-NAME', message: 'Missing meta.name (network title).' })
  if (!Array.isArray(model.devices)) {
    diags.push({ severity: 'error', code: 'DEVICES-MISSING', message: '"devices" must be an array.' })
    return false
  }
  if (!Array.isArray(model.links)) {
    diags.push({ severity: 'error', code: 'LINKS-MISSING', message: '"links" must be an array (it may be empty).' })
    return false
  }
  for (const d of model.devices) {
    if (d && !TIPOS_VALIDOS.includes(d.type)) {
      diags.push({ severity: 'error', code: 'DEVICE-TYPE', message: `${d.id}: unrecognized type "${d.type}". Valid types: ${TIPOS_VALIDOS.join(', ')}.`, subject: { device: d.id } })
    }
    if (d && !Array.isArray(d.interfaces)) {
      diags.push({ severity: 'error', code: 'IFACES-MISSING', message: `${d.id}: "interfaces" must be an array.`, subject: { device: d.id } })
      d.interfaces = []
    }
  }
  const ids = new Set(model.devices.map((d) => d?.id))
  for (const v of model.vlans ?? []) {
    if (!Number.isInteger(v.id) || v.id < 1 || v.id > 4094) diags.push({ severity: 'error', code: 'VLAN-ID', message: `VLAN ${v.id} out of range (1-4094).`, subject: { vlan: v.id } })
    if (v.id >= 1002 && v.id <= 1005) diags.push({ severity: 'error', code: 'VLAN-RESERVED', message: `VLAN ${v.id} is reserved (1002-1005).`, subject: { vlan: v.id } })
    if (v.subnet && !parseCidr4(v.subnet)) diags.push({ severity: 'error', code: 'VLAN-SUBNET', message: `VLAN ${v.id}: invalid subnet "${v.subnet}".`, subject: { vlan: v.id } })
  }
  const vistos = new Set<number>()
  for (const v of model.vlans ?? []) {
    if (vistos.has(v.id)) diags.push({ severity: 'error', code: 'VLAN-DUP', message: `VLAN ${v.id} declared twice.`, subject: { vlan: v.id } })
    vistos.add(v.id)
  }
  for (const z of model.zones ?? []) {
    for (const m of z.devices ?? []) if (!ids.has(m)) diags.push({ severity: 'warning', code: 'ZONE-DEVICE', message: `Zone ${z.id}: device ${m} does not exist.` })
  }
  return true
}

function checkCatalog(devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  for (const d of devices.values()) {
    const e = lookupModel(d.model)
    if (!e) {
      if (d.model) diags.push({ severity: 'info', code: 'MODEL-NOT-IN-CATALOG', message: `${d.id}: model "${d.model}" is not in the catalog; interface names are not validated.`, subject: { device: d.id } })
      continue
    }
    if (e.type !== d.type && !(e.type === 'router' && d.type === 'internet')) {
      diags.push({ severity: 'warning', code: 'MODEL-TYPE', message: `${d.id}: model ${e.model} is of type ${e.type}, but the device is ${d.type}.`, subject: { device: d.id } })
    }
    for (const i of d.ifaces) {
      if (interfaceExists(e, i.name) === false) {
        diags.push({ severity: 'error', code: 'IF-NOT-IN-MODEL', message: `${d.id}: ${i.name} does not exist on a ${e.model} (built-in: ${e.interfaces.join(', ')}${e.modules ? `; with module: ${e.modules}` : ''}).`, subject: { device: d.id, interface: i.name } })
      }
    }
  }
}

function l3Ifaces(devices: Map<string, NDevice>): NIface[] {
  return [...devices.values()].flatMap((d) => d.ifaces.filter((i) => i.cidr))
}

function checkAddressing(model: NetworkModel, devices: Map<string, NDevice>, segments: Segment[], segmentOf: Map<string, Segment>, diags: Diagnostic[]): void {
  const porIp = new Map<number, NIface[]>()
  for (const i of l3Ifaces(devices)) {
    const c = i.cidr!
    if (!porIp.has(c.ip)) porIp.set(c.ip, [])
    porIp.get(c.ip)!.push(i)
    const sujeto = { device: i.deviceId, interface: i.name }
    if (c.prefix <= 30 && c.prefix > 0) {
      if (c.ip === networkOf(c.ip, c.prefix)) diags.push({ severity: 'error', code: 'IP-IS-NETWORK', message: `${i.deviceId} ${i.name}: ${formatIpv4(c.ip)}/${c.prefix} is the network address.`, subject: sujeto })
      if (c.ip === broadcastOf(c.ip, c.prefix)) diags.push({ severity: 'error', code: 'IP-IS-BROADCAST', message: `${i.deviceId} ${i.name}: ${formatIpv4(c.ip)}/${c.prefix} is the broadcast address.`, subject: sujeto })
    }
  }
  for (const [ip, lista] of porIp) {
    if (lista.length > 1) {
      diags.push({ severity: 'error', code: 'IP-DUP', message: `Duplicate IP ${formatIpv4(ip)}: ${lista.map((i) => `${i.deviceId} ${i.name}`).join(', ')}.`, subject: { device: lista[0].deviceId } })
    }
  }
  // Subnet consistency within each L2 domain and overlaps between domains
  const subredDe = new Map<Segment, string>()
  for (const s of segments) {
    const conIp = s.ifaces.filter((i) => i.cidr && i.mode !== 'loopback')
    const claves = [...new Set(conIp.map((i) => cidrKey(i.cidr!)))]
    if (claves.length > 1) {
      diags.push({
        severity: 'error', code: 'SEGMENT-SUBNET-MISMATCH',
        message: `Interfaces in the same L2 domain with different subnets: ${conIp.map((i) => `${i.deviceId} ${i.name} (${cidrKey(i.cidr!)})`).join('; ')}.`,
        subject: { device: conIp[0].deviceId, interface: conIp[0].name },
        hint: 'Check masks, access VLANs and trunks; or place the devices in separate VLANs.',
      })
    }
    if (claves.length) subredDe.set(s, claves[0])
  }
  const lista = [...subredDe.entries()]
  for (let x = 0; x < lista.length; x++) {
    for (let y = x + 1; y < lista.length; y++) {
      const a = parseCidr4(lista[x][1])!
      const b = parseCidr4(lista[y][1])!
      if (!overlaps(a, b)) continue
      const ia = lista[x][0].ifaces.find((i) => i.cidr)!
      const ib = lista[y][0].ifaces.find((i) => i.cidr)!
      const mismo = ia.deviceId === ib.deviceId
      diags.push({
        severity: 'error', code: mismo ? 'OVERLAP-SAME-DEVICE' : 'SUBNET-OVERLAP',
        message: mismo
          ? `${ia.deviceId}: ${ia.name} (${lista[x][1]}) and ${ib.name} (${lista[y][1]}) overlap; IOS rejects the second one ("overlaps with").`
          : `Subnet ${lista[x][1]} (${ia.deviceId} ${ia.name}) overlaps with ${lista[y][1]} (${ib.deviceId} ${ib.name}) in another L2 domain.`,
        subject: { device: ib.deviceId, interface: ib.name },
        hint: mismo ? undefined : 'If they should be on the same network, check VLAN/trunk/cabling between them; otherwise, change the addressing.',
      })
    }
  }
  // Gateways of hosts and L2 switches
  for (const d of devices.values()) {
    const esHost = HOST_TYPES.has(d.type)
    const i = esHost ? d.ifaces.find((x) => x.mode === 'host' && x.cidr) : d.type === 'switch' ? d.ifaces.find((x) => x.mode === 'svi' && x.cidr) : undefined
    if (!i) continue
    const sujeto = { device: d.id, interface: i.name }
    if (!d.gateway) {
      if (esHost) diags.push({ severity: 'warning', code: 'HOST-NO-GATEWAY', message: `${d.id} has no gateway; it can only communicate within ${cidrKey(i.cidr!)}.`, subject: sujeto })
      else diags.push({ severity: 'info', code: 'SWITCH-NO-GATEWAY', message: `${d.id}: no "ip default-gateway"; it will not be manageable from other networks.`, subject: sujeto })
      continue
    }
    const gw = parseIpv4(d.gateway)
    if (gw === null) { diags.push({ severity: 'error', code: 'GW-INVALID', message: `${d.id}: invalid gateway "${d.gateway}".`, subject: sujeto }); continue }
    if (!containsIp(i.cidr!, gw)) {
      diags.push({ severity: 'error', code: 'GW-NOT-IN-SUBNET', message: `${d.id}: gateway ${d.gateway} does not belong to ${cidrKey(i.cidr!)}.`, subject: sujeto })
      continue
    }
    const seg = segmentOf.get(`${d.id}|${i.key}`)
    const enSeg = seg?.ifaces.some((x) => x.deviceId !== d.id && (x.cidr?.ip === gw || (!!x.hsrp && parseIpv4(x.hsrp.ip) === gw)))
    if (!enSeg) {
      const existe = l3Ifaces(devices).find((x) => x.cidr!.ip === gw || (!!x.hsrp && parseIpv4(x.hsrp.ip) === gw))
      diags.push({
        severity: 'error', code: 'GW-UNREACHABLE',
        message: existe
          ? `${d.id}: gateway ${d.gateway} (${existe.deviceId} ${existe.name}) is not in the same L2 domain as ${d.id}.`
          : `${d.id}: no interface in the model has the gateway IP ${d.gateway}.`,
        subject: sujeto,
        hint: existe ? 'Check the port access VLAN, the allowed/native VLANs on the trunks and the subinterface/SVI.' : 'Configure that IP on the router interface/subinterface/SVI.',
      })
    }
  }
  // Declared VLANs vs the L3 interfaces that serve them
  for (const v of model.vlans ?? []) {
    const l3 = l3Ifaces(devices).filter((i) => (i.mode === 'svi' || i.mode === 'subinterface') && i.vlan === v.id)
    for (const i of l3) {
      if (v.gateway && formatIpv4(i.cidr!.ip) !== v.gateway && i.hsrp?.ip !== v.gateway && d0(devices, i).type !== 'switch') {
        diags.push({ severity: 'warning', code: 'VLAN-GW-MISMATCH', message: `VLAN ${v.id}: the declared gateway is ${v.gateway} but ${i.deviceId} ${i.name} has ${formatIpv4(i.cidr!.ip)}.`, subject: { device: i.deviceId, interface: i.name, vlan: v.id } })
      }
      const vs = v.subnet ? parseCidr4(v.subnet) : null
      if (vs && cidrKey(vs) !== cidrKey(i.cidr!)) {
        diags.push({ severity: 'warning', code: 'VLAN-SUBNET-MISMATCH', message: `VLAN ${v.id}: declared subnet ${v.subnet} but ${i.deviceId} ${i.name} uses ${cidrKey(i.cidr!)}.`, subject: { device: i.deviceId, interface: i.name, vlan: v.id } })
      }
    }
  }
}

function d0(devices: Map<string, NDevice>, i: NIface): NDevice { return devices.get(i.deviceId)! }

function checkDhcp(devices: Map<string, NDevice>, segmentOf: Map<string, Segment>, ctx: L3Context, diags: Diagnostic[]): void {
  const usadas = new Set(l3Ifaces(devices).map((i) => i.cidr!.ip))
  const servidores = [...devices.values()].filter((d) => d.services?.dhcp?.pools?.length)
  // Pool validation
  for (const s of servidores) {
    for (const p of s.services!.dhcp!.pools) {
      const red = parseCidr4(p.network)
      if (!red) { diags.push({ severity: 'error', code: 'DHCP-POOL-NETWORK', message: `${s.id}: pool ${p.name} has an invalid network "${p.network}".`, subject: { device: s.id } }); continue }
      if (!p.defaultRouter) { diags.push({ severity: 'warning', code: 'DHCP-NO-DEFAULT-ROUTER', message: `${s.id}: pool ${p.name} does not provide a default-router; clients will have no gateway.`, subject: { device: s.id } }); continue }
      const gw = parseIpv4(p.defaultRouter)
      if (gw === null || !containsIp(red, gw)) { diags.push({ severity: 'error', code: 'DHCP-GW-OUTSIDE', message: `${s.id}: default-router ${p.defaultRouter} is outside the network of pool ${p.name} (${p.network}).`, subject: { device: s.id } }); continue }
      if (s.type !== 'server' && !excluida(s, gw)) {
        diags.push({ severity: 'warning', code: 'DHCP-GW-NOT-EXCLUDED', message: `${s.id}: gateway ${p.defaultRouter} is not in "ip dhcp excluded-address" for pool ${p.name}.`, subject: { device: s.id }, hint: 'IOS detects the conflict via ping, but excluding the gateway and static servers is the correct practice.' })
      }
    }
  }
  // (Simulated) address assignment to DHCP clients
  const asignadas = new Set<number>()
  for (const d of devices.values()) {
    const hi = d.ifaces.find((i) => i.mode === 'host')
    if (!hi) continue
    if (hi.cidr) {
      ctx.hostIp.set(d.id, { ip: hi.cidr.ip, prefix: hi.cidr.prefix, gateway: d.gateway ? parseIpv4(d.gateway) ?? undefined : undefined, simulated: false })
      continue
    }
    if (!hi.dhcp) continue
    const seg = segmentOf.get(`${d.id}|${hi.key}`)
    const gwIfs = (seg?.ifaces ?? []).filter((i) => i.cidr && i.deviceId !== d.id && routesDevice(devices.get(i.deviceId)!))
    let encontrado: { server: NDevice; pool: { network: string; defaultRouter?: string; name: string } } | undefined
    // a) server in the same L2 domain
    for (const s of servidores) {
      const enSeg = s.ifaces.find((i) => i.cidr && segmentOf.get(`${s.id}|${i.key}`) === seg)
      if (!enSeg) continue
      const ref = gwIfs[0]?.cidr?.ip ?? enSeg.cidr!.ip
      const pool = s.services!.dhcp!.pools.find((p) => { const c = parseCidr4(p.network); return !!c && containsIp(c, ref) })
      if (pool) { encontrado = { server: s, pool }; break }
    }
    // b) relay via ip helper-address
    if (!encontrado) {
      for (const g of gwIfs) {
        for (const h of g.helper ?? []) {
          const ipH = parseIpv4(h)
          const s = servidores.find((x) => x.ifaces.some((i) => i.cidr?.ip === ipH))
          if (!s) { diags.push({ severity: 'warning', code: 'DHCP-HELPER-TARGET', message: `${g.deviceId} ${g.name}: ip helper-address ${h} does not point to a DHCP server in the model.`, subject: { device: g.deviceId, interface: g.name } }); continue }
          const pool = s.services!.dhcp!.pools.find((p) => { const c = parseCidr4(p.network); return !!c && containsIp(c, g.cidr!.ip) })
          if (pool) { encontrado = { server: s, pool }; break }
        }
        if (encontrado) break
      }
    }
    if (!encontrado) {
      const gwTxt = gwIfs.length ? `${gwIfs[0].deviceId} ${gwIfs[0].name}` : 'no gateway'
      diags.push({
        severity: 'error', code: 'DHCP-NO-SERVER', message: `${d.id} uses DHCP but no pool serves its network (L2 domain with ${gwTxt}).`, subject: { device: d.id, interface: hi.name },
        hint: 'Create a pool for that network on the router, or add "ip helper-address <server>" on the gateway interface.',
      })
      continue
    }
    const red = parseCidr4(encontrado.pool.network)!
    const gw = encontrado.pool.defaultRouter ? parseIpv4(encontrado.pool.defaultRouter) ?? undefined : undefined
    let ip = networkOf(red.ip, red.prefix) + 1
    const fin = broadcastOf(red.ip, red.prefix)
    while (ip < fin && (usadas.has(ip) || asignadas.has(ip) || ip === gw || excluida(encontrado.server, ip))) ip++
    if (ip >= fin) { diags.push({ severity: 'error', code: 'DHCP-POOL-EXHAUSTED', message: `Pool ${encontrado.pool.name} has no free addresses for ${d.id}.`, subject: { device: d.id } }); continue }
    asignadas.add(ip)
    ctx.hostIp.set(d.id, { ip, prefix: red.prefix, gateway: gw, simulated: true })
    diags.push({ severity: 'info', code: 'DHCP-SIMULATED', message: `${d.id} would obtain ${formatIpv4(ip)}/${red.prefix} via DHCP from ${encontrado.server.id} (pool ${encontrado.pool.name}; simulated).`, subject: { device: d.id } })
  }
}

function excluida(server: NDevice, ip: number): boolean {
  return (server.services?.dhcp?.excluded ?? []).some((r) => {
    const a = parseIpv4(r.from)
    const b = parseIpv4(r.to ?? r.from)
    return a !== null && b !== null && ip >= a && ip <= b
  })
}

function checkAclNat(devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  for (const d of devices.values()) {
    const definidas = new Map((d.acls ?? []).map((a) => [a.name, a]))
    const usadas = new Set<string>()
    const usar = (nombre: string | undefined, donde: string): void => {
      if (!nombre) return
      usadas.add(nombre)
      if (!definidas.has(nombre)) diags.push({ severity: 'error', code: 'ACL-UNDEFINED', message: `${d.id}: ${donde} uses ACL "${nombre}", which is not defined in acls.`, subject: { device: d.id } })
    }
    for (const i of d.ifaces) { usar(i.acl?.in, `${i.name} (in)`); usar(i.acl?.out, `${i.name} (out)`) }
    usar(d.security?.vtyAcl, 'line vty')
    for (const a of d.acls ?? []) {
      if (!usadas.has(a.name)) diags.push({ severity: 'info', code: 'ACL-UNUSED', message: `${d.id}: ACL ${a.name} is not applied to any interface or VTY.`, subject: { device: d.id } })
      const num = Number(a.name)
      if (Number.isInteger(num)) {
        const okStd = (num >= 1 && num <= 99) || (num >= 1300 && num <= 1999)
        const okExt = (num >= 100 && num <= 199) || (num >= 2000 && num <= 2699)
        if ((a.type === 'standard' && !okStd) || (a.type === 'extended' && !okExt)) {
          diags.push({ severity: 'error', code: 'ACL-NUMBER-RANGE', message: `${d.id}: ACL ${a.name} is not in the numeric range of a ${a.type} ACL.`, subject: { device: d.id } })
        }
      }
      a.entries.forEach((e, n) => {
        if (e.action === 'remark') return
        const pos = `${d.id} ACL ${a.name} entry ${n + 1}`
        if (!parseAclAddress(e.src)) diags.push({ severity: 'error', code: 'ACL-ADDRESS', message: `${pos}: invalid source "${e.src}".`, subject: { device: d.id } })
        if (a.type === 'standard' && (e.dst || e.dstPort || (e.protocol && e.protocol !== 'ip'))) {
          diags.push({ severity: 'warning', code: 'ACL-STANDARD-FIELDS', message: `${pos}: a standard ACL only filters by source; destination/protocol/ports are ignored.`, subject: { device: d.id } })
        }
        if (a.type === 'extended') {
          if (!parseAclAddress(e.dst)) diags.push({ severity: 'error', code: 'ACL-ADDRESS', message: `${pos}: invalid destination "${e.dst}".`, subject: { device: d.id } })
          const p = (e.protocol ?? 'ip').toLowerCase()
          if ((e.dstPort || e.srcPort) && p !== 'tcp' && p !== 'udp') diags.push({ severity: 'error', code: 'ACL-PORT-PROTOCOL', message: `${pos}: ports require protocol tcp or udp (has "${p}").`, subject: { device: d.id } })
        }
      })
    }
    const nat = d.services?.nat
    const inside = d.ifaces.filter((i) => i.nat === 'inside')
    const outside = d.ifaces.filter((i) => i.nat === 'outside')
    if (nat && isAsa(d)) {
      // ASA: object NAT, validated in security-checks
    } else if (nat) {
      if (!inside.length || !outside.length) diags.push({ severity: 'error', code: 'NAT-INTERFACES', message: `${d.id}: NAT requires at least one "ip nat inside" interface and one "ip nat outside" interface.`, subject: { device: d.id } })
      if (nat.overloadInterface) {
        const o = findIface(d, nat.overloadInterface)
        if (!o) diags.push({ severity: 'error', code: 'NAT-OVERLOAD-IF', message: `${d.id}: PAT interface ${nat.overloadInterface} does not exist.`, subject: { device: d.id } })
        else if (o.nat !== 'outside') diags.push({ severity: 'warning', code: 'NAT-OVERLOAD-NOT-OUTSIDE', message: `${d.id}: PAT uses ${o.name}, which is not marked as nat outside.`, subject: { device: d.id } })
      }
      for (const p of nat.insideSources ?? []) if (!parseCidr4(p)) diags.push({ severity: 'error', code: 'NAT-SOURCE', message: `${d.id}: insideSources contains an invalid prefix "${p}".`, subject: { device: d.id } })
      if ((nat.insideSources?.length ?? 0) === 0 && !(nat.static?.length)) diags.push({ severity: 'warning', code: 'NAT-NO-SOURCES', message: `${d.id}: NAT without insideSources or static translations.`, subject: { device: d.id } })
    } else if (inside.length || outside.length) {
      diags.push({ severity: 'warning', code: 'NAT-FLAGS-ONLY', message: `${d.id}: there are nat inside/outside interfaces but no services.nat.`, subject: { device: d.id } })
    }
  }
}

function checkRoutingConfig(devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  const rids = new Map<string, string>()
  for (const d of devices.values()) {
    const rid = d.routing?.ospf?.routerId
    if (rid) {
      if (rids.has(rid)) diags.push({ severity: 'error', code: 'OSPF-RID-DUP', message: `Duplicate OSPF Router-ID ${rid} on ${rids.get(rid)} and ${d.id}.`, subject: { device: d.id } })
      rids.set(rid, d.id)
    }
    if (d.type === 'l3switch' && d.routing?.ipRouting === false) {
      const svis = d.ifaces.filter((i) => i.mode === 'svi' && i.cidr)
      if (svis.length > 1) diags.push({ severity: 'warning', code: 'L3-NO-IP-ROUTING', message: `${d.id}: has ${svis.length} SVIs but "ip routing" is disabled; there will be no inter-VLAN routing.`, subject: { device: d.id } })
    }
    if ((d.type === 'switch') && d.routing && (d.routing.ospf || d.routing.eigrp || d.routing.rip || d.routing.static?.length)) {
      diags.push({ severity: 'error', code: 'ROUTING-ON-L2', message: `${d.id} is an L2 switch: it does not run routing protocols or static routes (use "gateway").`, subject: { device: d.id } })
    }
    if (d.routing?.rip && (d.routing.rip.version ?? 1) === 1) {
      diags.push({ severity: 'info', code: 'RIP-V1', message: `${d.id}: RIP v1 is classful (no VLSM). Use "version": 2.`, subject: { device: d.id } })
    }
  }
}

function checkSecurity(model: NetworkModel, devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  const produccion = model.meta?.target === 'ios' || model.meta?.target === 'iosxe'
  for (const d of devices.values()) {
    const s = d.security
    if (!s) continue
    const secretos = [s.enableSecret, s.consolePassword, s.vtyPassword, s.ssh?.password].filter(Boolean) as string[]
    if (produccion && secretos.some((x) => SECRETOS_DEBILES.has(x.toLowerCase()))) {
      diags.push({ severity: 'warning', code: 'WEAK-SECRET', message: `${d.id}: uses lab passwords with a production target (${model.meta.target}).`, subject: { device: d.id } })
    }
    const mod = s.ssh?.modulus ?? 1024
    if (s.ssh && mod < 768) diags.push({ severity: 'error', code: 'SSH-MODULUS', message: `${d.id}: SSH v2 requires an RSA key of at least 768 bits (has ${mod}).`, subject: { device: d.id } })
    else if (s.ssh && produccion && mod < 2048) diags.push({ severity: 'info', code: 'SSH-MODULUS-PROD', message: `${d.id}: in production use RSA keys of 2048 bits or more.`, subject: { device: d.id } })
  }
  for (const d of devices.values()) {
    if (d.extraConfig?.length) diags.push({ severity: 'info', code: 'EXTRA-CONFIG', message: `${d.id}: ${d.extraConfig.length} line(s) in extraConfig not validated by the tool; verify them manually.`, subject: { device: d.id } })
  }
}

function checkTopology(devices: Map<string, NDevice>, links: ResolvedLink[], diags: Diagnostic[]): void {
  const conectados = new Set(links.flatMap((l) => [l.a.dev.id, l.b.dev.id]))
  for (const d of devices.values()) {
    if (!conectados.has(d.id)) diags.push({ severity: 'warning', code: 'DEVICE-ISOLATED', message: `${d.id} has no links.`, subject: { device: d.id } })
    for (const i of d.ifaces) {
      if (i.shutdown && links.some((l) => (l.a.iface === i || l.b.iface === i))) {
        diags.push({ severity: 'info', code: 'IF-SHUTDOWN', message: `${d.id} ${i.name} is connected but administratively down (shutdown).`, subject: { device: d.id, interface: i.name } })
      }
    }
  }
}

/** The HSRP active router of each VLAN should also be the STP root bridge (avoids traffic over the inter-distribution link). */
function checkStpHsrp(ctx: L3Context, stp: StpResult, diags: Diagnostic[]): void {
  for (const h of ctx.hsrp) {
    if (h.role !== 'active') continue
    const vlan = Number(h.iface.match(/^Vlan(\d+)$/i)?.[1])
    if (!vlan) continue
    const v = stp.vlans.find((x) => x.vlan === vlan && x.ports.some((p) => p.device === h.device))
    if (v && v.root !== h.device) {
      diags.push({ severity: 'warning', code: 'STP-HSRP-MISALIGNED', message: `VLAN ${vlan}: the HSRP active router is ${h.device} but the STP root bridge is ${v.root}; traffic to the gateway takes an extra path.`, subject: { device: h.device, vlan }, hint: `Make ${h.device} root primary for VLAN ${vlan} (or make the root bridge the HSRP active router).` })
    }
  }
}

export function analyze(model: NetworkModel): Analysis {
  const diags: Diagnostic[] = []
  const ctx: L3Context = newContext()
  const stpVacio: StpResult = { vlans: [], blocked: new Map() }
  const vacio: Analysis = { model, devices: new Map(), links: [], segments: [], segmentOf: new Map(), vlanDevices: new Map(), ctx, tables6: new Map(), stp: stpVacio, tests: [], diagnostics: diags, counts: { error: 0, warning: 0, info: 0 } }
  checkSchema(model, diags)
  if (!checkStructure(model, diags)) return finish(vacio)
  const devices = normalizeModel(model, diags)
  checkCatalog(devices, diags)
  const links = resolveLinks(model, devices, diags)
  checkL2(model, devices, links, diags)
  const { segments, segmentOf, vlanDevices } = computeSegments(model, devices, links)
  ctx.devices = devices
  ctx.segmentOf = segmentOf
  computeHsrp(ctx, diags)
  checkAddressing(model, devices, segments, segmentOf, diags)
  checkDhcp(devices, segmentOf, ctx, diags)
  checkRoutingConfig(devices, diags)
  buildRouteTables(model, ctx, diags)
  checkIpv6(ctx, diags)
  const tables6 = buildRoute6Tables(ctx, diags)
  const stp = computeStp(model, devices, links, diags)
  checkStpHsrp(ctx, stp, diags)
  checkAclNat(devices, diags)
  checkAsa(devices, diags)
  checkVpn(devices, ctx, model.meta?.target ?? 'packet-tracer', diags)
  checkSecurity(model, devices, diags)
  checkTopology(devices, links, diags)
  const tests: TestResult[] = (model.tests ?? []).map((t) => {
    const r = tracePing(ctx, model, t.from, t.to)
    const expect = t.expect ?? 'success'
    const passed = r.status === 'unknown' ? null : (r.status === 'success') === (expect === 'success')
    if (passed === false) {
      diags.push({ severity: 'error', code: 'TEST-FAILED', message: `Ping test ${t.from} → ${t.to}: expected ${expect === 'success' ? 'success' : 'failure'} but the result is ${r.status === 'success' ? 'success' : 'failure'}. ${r.status === 'success' ? '' : r.reason}`.trim(), subject: { device: t.from } })
    } else if (passed === null) {
      diags.push({ severity: 'info', code: 'TEST-UNKNOWN', message: `Ping test ${t.from} → ${t.to}: cannot be verified with the model (${r.reason}).`, subject: { device: t.from } })
    }
    return { ...r, expect, passed, description: t.description }
  })
  return finish({ model, devices, links, segments, segmentOf, vlanDevices, ctx, tables6, stp, tests, diagnostics: diags, counts: { error: 0, warning: 0, info: 0 } })
}

function finish(a: Analysis): Analysis {
  const vistos = new Set<string>()
  a.diagnostics = a.diagnostics.filter((d) => {
    const k = `${d.severity}|${d.code}|${d.message}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  const orden = { error: 0, warning: 1, info: 2 }
  a.diagnostics.sort((x, y) => orden[x.severity] - orden[y.severity])
  for (const d of a.diagnostics) a.counts[d.severity]++
  return a
}

export function routeTable(a: Analysis, deviceId: string): Route[] {
  return a.ctx.tables.get(deviceId) ?? []
}

export { ifUp }
