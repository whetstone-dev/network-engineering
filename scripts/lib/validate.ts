// Orquesta el análisis completo del modelo: estructura, L2, direccionamiento, DHCP, routing,
// ACL/NAT, seguridad y pruebas. Todo artefacto (diagrama, configs, docs) parte de este resultado.

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
    diags.push({ severity: 'error', code: 'MODEL-INVALID', message: 'El archivo no contiene un objeto JSON de modelo.' })
    return false
  }
  if (model.modelVersion !== MODEL_VERSION) {
    diags.push({ severity: 'warning', code: 'MODEL-VERSION', message: `modelVersion es ${model.modelVersion}; esta herramienta espera ${MODEL_VERSION}.` })
  }
  if (!model.meta?.name) diags.push({ severity: 'warning', code: 'META-NAME', message: 'Falta meta.name (título de la red).' })
  if (!Array.isArray(model.devices)) {
    diags.push({ severity: 'error', code: 'DEVICES-MISSING', message: '"devices" debe ser un arreglo.' })
    return false
  }
  if (!Array.isArray(model.links)) {
    diags.push({ severity: 'error', code: 'LINKS-MISSING', message: '"links" debe ser un arreglo (puede estar vacío).' })
    return false
  }
  for (const d of model.devices) {
    if (d && !TIPOS_VALIDOS.includes(d.type)) {
      diags.push({ severity: 'error', code: 'DEVICE-TYPE', message: `${d.id}: tipo "${d.type}" no reconocido. Válidos: ${TIPOS_VALIDOS.join(', ')}.`, subject: { device: d.id } })
    }
    if (d && !Array.isArray(d.interfaces)) {
      diags.push({ severity: 'error', code: 'IFACES-MISSING', message: `${d.id}: "interfaces" debe ser un arreglo.`, subject: { device: d.id } })
      d.interfaces = []
    }
  }
  const ids = new Set(model.devices.map((d) => d?.id))
  for (const v of model.vlans ?? []) {
    if (!Number.isInteger(v.id) || v.id < 1 || v.id > 4094) diags.push({ severity: 'error', code: 'VLAN-ID', message: `VLAN ${v.id} fuera de rango (1-4094).`, subject: { vlan: v.id } })
    if (v.id >= 1002 && v.id <= 1005) diags.push({ severity: 'error', code: 'VLAN-RESERVED', message: `VLAN ${v.id} está reservada (1002-1005).`, subject: { vlan: v.id } })
    if (v.subnet && !parseCidr4(v.subnet)) diags.push({ severity: 'error', code: 'VLAN-SUBNET', message: `VLAN ${v.id}: subred inválida "${v.subnet}".`, subject: { vlan: v.id } })
  }
  const vistos = new Set<number>()
  for (const v of model.vlans ?? []) {
    if (vistos.has(v.id)) diags.push({ severity: 'error', code: 'VLAN-DUP', message: `VLAN ${v.id} declarada dos veces.`, subject: { vlan: v.id } })
    vistos.add(v.id)
  }
  for (const z of model.zones ?? []) {
    for (const m of z.devices ?? []) if (!ids.has(m)) diags.push({ severity: 'warning', code: 'ZONE-DEVICE', message: `Zona ${z.id}: el dispositivo ${m} no existe.` })
  }
  return true
}

function checkCatalog(devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  for (const d of devices.values()) {
    const e = lookupModel(d.model)
    if (!e) {
      if (d.model) diags.push({ severity: 'info', code: 'MODEL-NOT-IN-CATALOG', message: `${d.id}: el modelo "${d.model}" no está en el catálogo; no se validan nombres de interfaz.`, subject: { device: d.id } })
      continue
    }
    if (e.type !== d.type && !(e.type === 'router' && d.type === 'internet')) {
      diags.push({ severity: 'warning', code: 'MODEL-TYPE', message: `${d.id}: el modelo ${e.model} es de tipo ${e.type}, pero el dispositivo es ${d.type}.`, subject: { device: d.id } })
    }
    for (const i of d.ifaces) {
      if (interfaceExists(e, i.name) === false) {
        diags.push({ severity: 'error', code: 'IF-NOT-IN-MODEL', message: `${d.id}: ${i.name} no existe en un ${e.model} (integradas: ${e.interfaces.join(', ')}${e.modules ? `; con módulo: ${e.modules}` : ''}).`, subject: { device: d.id, interface: i.name } })
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
      if (c.ip === networkOf(c.ip, c.prefix)) diags.push({ severity: 'error', code: 'IP-IS-NETWORK', message: `${i.deviceId} ${i.name}: ${formatIpv4(c.ip)}/${c.prefix} es la dirección de red.`, subject: sujeto })
      if (c.ip === broadcastOf(c.ip, c.prefix)) diags.push({ severity: 'error', code: 'IP-IS-BROADCAST', message: `${i.deviceId} ${i.name}: ${formatIpv4(c.ip)}/${c.prefix} es la dirección de broadcast.`, subject: sujeto })
    }
  }
  for (const [ip, lista] of porIp) {
    if (lista.length > 1) {
      diags.push({ severity: 'error', code: 'IP-DUP', message: `IP duplicada ${formatIpv4(ip)}: ${lista.map((i) => `${i.deviceId} ${i.name}`).join(', ')}.`, subject: { device: lista[0].deviceId } })
    }
  }
  // Coherencia de subred dentro de cada dominio L2 y solapamientos entre dominios
  const subredDe = new Map<Segment, string>()
  for (const s of segments) {
    const conIp = s.ifaces.filter((i) => i.cidr && i.mode !== 'loopback')
    const claves = [...new Set(conIp.map((i) => cidrKey(i.cidr!)))]
    if (claves.length > 1) {
      diags.push({
        severity: 'error', code: 'SEGMENT-SUBNET-MISMATCH',
        message: `Interfaces en el mismo dominio L2 con subredes distintas: ${conIp.map((i) => `${i.deviceId} ${i.name} (${cidrKey(i.cidr!)})`).join('; ')}.`,
        subject: { device: conIp[0].deviceId, interface: conIp[0].name },
        hint: 'Revise máscaras, VLAN de acceso y trunks; o separe los equipos en VLAN distintas.',
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
          ? `${ia.deviceId}: ${ia.name} (${lista[x][1]}) y ${ib.name} (${lista[y][1]}) se solapan; IOS rechaza la segunda ("overlaps with").`
          : `La subred ${lista[x][1]} (${ia.deviceId} ${ia.name}) se solapa con ${lista[y][1]} (${ib.deviceId} ${ib.name}) en otro dominio L2.`,
        subject: { device: ib.deviceId, interface: ib.name },
        hint: mismo ? undefined : 'Si deberían estar en la misma red, revise VLAN/trunk/cableado entre ellos; si no, cambie el direccionamiento.',
      })
    }
  }
  // Gateways de hosts y switches L2
  for (const d of devices.values()) {
    const esHost = HOST_TYPES.has(d.type)
    const i = esHost ? d.ifaces.find((x) => x.mode === 'host' && x.cidr) : d.type === 'switch' ? d.ifaces.find((x) => x.mode === 'svi' && x.cidr) : undefined
    if (!i) continue
    const sujeto = { device: d.id, interface: i.name }
    if (!d.gateway) {
      if (esHost) diags.push({ severity: 'warning', code: 'HOST-NO-GATEWAY', message: `${d.id} no tiene gateway; solo podrá comunicarse dentro de ${cidrKey(i.cidr!)}.`, subject: sujeto })
      else diags.push({ severity: 'info', code: 'SWITCH-NO-GATEWAY', message: `${d.id}: sin "ip default-gateway"; no será gestionable desde otras redes.`, subject: sujeto })
      continue
    }
    const gw = parseIpv4(d.gateway)
    if (gw === null) { diags.push({ severity: 'error', code: 'GW-INVALID', message: `${d.id}: gateway inválido "${d.gateway}".`, subject: sujeto }); continue }
    if (!containsIp(i.cidr!, gw)) {
      diags.push({ severity: 'error', code: 'GW-NOT-IN-SUBNET', message: `${d.id}: el gateway ${d.gateway} no pertenece a ${cidrKey(i.cidr!)}.`, subject: sujeto })
      continue
    }
    const seg = segmentOf.get(`${d.id}|${i.key}`)
    const enSeg = seg?.ifaces.some((x) => x.deviceId !== d.id && (x.cidr?.ip === gw || (!!x.hsrp && parseIpv4(x.hsrp.ip) === gw)))
    if (!enSeg) {
      const existe = l3Ifaces(devices).find((x) => x.cidr!.ip === gw || (!!x.hsrp && parseIpv4(x.hsrp.ip) === gw))
      diags.push({
        severity: 'error', code: 'GW-UNREACHABLE',
        message: existe
          ? `${d.id}: el gateway ${d.gateway} (${existe.deviceId} ${existe.name}) no está en el mismo dominio L2 que ${d.id}.`
          : `${d.id}: ninguna interfaz del modelo tiene la IP del gateway ${d.gateway}.`,
        subject: sujeto,
        hint: existe ? 'Revise VLAN de acceso del puerto, VLAN permitidas/nativa en los trunks y la subinterfaz/SVI.' : 'Configure esa IP en la interfaz/subinterfaz/SVI del router.',
      })
    }
  }
  // VLAN declaradas vs interfaces L3 que las sirven
  for (const v of model.vlans ?? []) {
    const l3 = l3Ifaces(devices).filter((i) => (i.mode === 'svi' || i.mode === 'subinterface') && i.vlan === v.id)
    for (const i of l3) {
      if (v.gateway && formatIpv4(i.cidr!.ip) !== v.gateway && i.hsrp?.ip !== v.gateway && d0(devices, i).type !== 'switch') {
        diags.push({ severity: 'warning', code: 'VLAN-GW-MISMATCH', message: `VLAN ${v.id}: el gateway declarado es ${v.gateway} pero ${i.deviceId} ${i.name} tiene ${formatIpv4(i.cidr!.ip)}.`, subject: { device: i.deviceId, interface: i.name, vlan: v.id } })
      }
      const vs = v.subnet ? parseCidr4(v.subnet) : null
      if (vs && cidrKey(vs) !== cidrKey(i.cidr!)) {
        diags.push({ severity: 'warning', code: 'VLAN-SUBNET-MISMATCH', message: `VLAN ${v.id}: subred declarada ${v.subnet} pero ${i.deviceId} ${i.name} usa ${cidrKey(i.cidr!)}.`, subject: { device: i.deviceId, interface: i.name, vlan: v.id } })
      }
    }
  }
}

function d0(devices: Map<string, NDevice>, i: NIface): NDevice { return devices.get(i.deviceId)! }

function checkDhcp(devices: Map<string, NDevice>, segmentOf: Map<string, Segment>, ctx: L3Context, diags: Diagnostic[]): void {
  const usadas = new Set(l3Ifaces(devices).map((i) => i.cidr!.ip))
  const servidores = [...devices.values()].filter((d) => d.services?.dhcp?.pools?.length)
  // Validación de pools
  for (const s of servidores) {
    for (const p of s.services!.dhcp!.pools) {
      const red = parseCidr4(p.network)
      if (!red) { diags.push({ severity: 'error', code: 'DHCP-POOL-NETWORK', message: `${s.id}: pool ${p.name} con red inválida "${p.network}".`, subject: { device: s.id } }); continue }
      if (!p.defaultRouter) { diags.push({ severity: 'warning', code: 'DHCP-NO-DEFAULT-ROUTER', message: `${s.id}: el pool ${p.name} no entrega default-router; los clientes no tendrán gateway.`, subject: { device: s.id } }); continue }
      const gw = parseIpv4(p.defaultRouter)
      if (gw === null || !containsIp(red, gw)) { diags.push({ severity: 'error', code: 'DHCP-GW-OUTSIDE', message: `${s.id}: default-router ${p.defaultRouter} fuera de la red del pool ${p.name} (${p.network}).`, subject: { device: s.id } }); continue }
      if (s.type !== 'server' && !excluida(s, gw)) {
        diags.push({ severity: 'warning', code: 'DHCP-GW-NOT-EXCLUDED', message: `${s.id}: el gateway ${p.defaultRouter} no está en "ip dhcp excluded-address" del pool ${p.name}.`, subject: { device: s.id }, hint: 'IOS detecta el conflicto por ping, pero excluir gateway y servidores estáticos es la práctica correcta.' })
      }
    }
  }
  // Asignación (simulada) a clientes DHCP
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
    // a) servidor en el mismo dominio L2
    for (const s of servidores) {
      const enSeg = s.ifaces.find((i) => i.cidr && segmentOf.get(`${s.id}|${i.key}`) === seg)
      if (!enSeg) continue
      const ref = gwIfs[0]?.cidr?.ip ?? enSeg.cidr!.ip
      const pool = s.services!.dhcp!.pools.find((p) => { const c = parseCidr4(p.network); return !!c && containsIp(c, ref) })
      if (pool) { encontrado = { server: s, pool }; break }
    }
    // b) relay con ip helper-address
    if (!encontrado) {
      for (const g of gwIfs) {
        for (const h of g.helper ?? []) {
          const ipH = parseIpv4(h)
          const s = servidores.find((x) => x.ifaces.some((i) => i.cidr?.ip === ipH))
          if (!s) { diags.push({ severity: 'warning', code: 'DHCP-HELPER-TARGET', message: `${g.deviceId} ${g.name}: ip helper-address ${h} no apunta a un servidor DHCP del modelo.`, subject: { device: g.deviceId, interface: g.name } }); continue }
          const pool = s.services!.dhcp!.pools.find((p) => { const c = parseCidr4(p.network); return !!c && containsIp(c, g.cidr!.ip) })
          if (pool) { encontrado = { server: s, pool }; break }
        }
        if (encontrado) break
      }
    }
    if (!encontrado) {
      const gwTxt = gwIfs.length ? `${gwIfs[0].deviceId} ${gwIfs[0].name}` : 'ningún gateway'
      diags.push({
        severity: 'error', code: 'DHCP-NO-SERVER', message: `${d.id} usa DHCP pero no hay pool que sirva su red (dominio L2 con ${gwTxt}).`, subject: { device: d.id, interface: hi.name },
        hint: 'Cree un pool para esa red en el router, o agregue "ip helper-address <servidor>" en la interfaz gateway.',
      })
      continue
    }
    const red = parseCidr4(encontrado.pool.network)!
    const gw = encontrado.pool.defaultRouter ? parseIpv4(encontrado.pool.defaultRouter) ?? undefined : undefined
    let ip = networkOf(red.ip, red.prefix) + 1
    const fin = broadcastOf(red.ip, red.prefix)
    while (ip < fin && (usadas.has(ip) || asignadas.has(ip) || ip === gw || excluida(encontrado.server, ip))) ip++
    if (ip >= fin) { diags.push({ severity: 'error', code: 'DHCP-POOL-EXHAUSTED', message: `Pool ${encontrado.pool.name} sin direcciones libres para ${d.id}.`, subject: { device: d.id } }); continue }
    asignadas.add(ip)
    ctx.hostIp.set(d.id, { ip, prefix: red.prefix, gateway: gw, simulated: true })
    diags.push({ severity: 'info', code: 'DHCP-SIMULATED', message: `${d.id} obtendría ${formatIpv4(ip)}/${red.prefix} por DHCP desde ${encontrado.server.id} (pool ${encontrado.pool.name}; simulado).`, subject: { device: d.id } })
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
      if (!definidas.has(nombre)) diags.push({ severity: 'error', code: 'ACL-UNDEFINED', message: `${d.id}: ${donde} usa la ACL "${nombre}", que no está definida en acls.`, subject: { device: d.id } })
    }
    for (const i of d.ifaces) { usar(i.acl?.in, `${i.name} (in)`); usar(i.acl?.out, `${i.name} (out)`) }
    usar(d.security?.vtyAcl, 'line vty')
    for (const a of d.acls ?? []) {
      if (!usadas.has(a.name)) diags.push({ severity: 'info', code: 'ACL-UNUSED', message: `${d.id}: la ACL ${a.name} no está aplicada a ninguna interfaz ni VTY.`, subject: { device: d.id } })
      const num = Number(a.name)
      if (Number.isInteger(num)) {
        const okStd = (num >= 1 && num <= 99) || (num >= 1300 && num <= 1999)
        const okExt = (num >= 100 && num <= 199) || (num >= 2000 && num <= 2699)
        if ((a.type === 'standard' && !okStd) || (a.type === 'extended' && !okExt)) {
          diags.push({ severity: 'error', code: 'ACL-NUMBER-RANGE', message: `${d.id}: ACL ${a.name} no está en el rango numérico de una ACL ${a.type}.`, subject: { device: d.id } })
        }
      }
      a.entries.forEach((e, n) => {
        if (e.action === 'remark') return
        const pos = `${d.id} ACL ${a.name} entrada ${n + 1}`
        if (!parseAclAddress(e.src)) diags.push({ severity: 'error', code: 'ACL-ADDRESS', message: `${pos}: origen inválido "${e.src}".`, subject: { device: d.id } })
        if (a.type === 'standard' && (e.dst || e.dstPort || (e.protocol && e.protocol !== 'ip'))) {
          diags.push({ severity: 'warning', code: 'ACL-STANDARD-FIELDS', message: `${pos}: una ACL estándar solo filtra por origen; se ignoran destino/protocolo/puertos.`, subject: { device: d.id } })
        }
        if (a.type === 'extended') {
          if (!parseAclAddress(e.dst)) diags.push({ severity: 'error', code: 'ACL-ADDRESS', message: `${pos}: destino inválido "${e.dst}".`, subject: { device: d.id } })
          const p = (e.protocol ?? 'ip').toLowerCase()
          if ((e.dstPort || e.srcPort) && p !== 'tcp' && p !== 'udp') diags.push({ severity: 'error', code: 'ACL-PORT-PROTOCOL', message: `${pos}: los puertos requieren protocolo tcp o udp (tiene "${p}").`, subject: { device: d.id } })
        }
      })
    }
    const nat = d.services?.nat
    const inside = d.ifaces.filter((i) => i.nat === 'inside')
    const outside = d.ifaces.filter((i) => i.nat === 'outside')
    if (nat && isAsa(d)) {
      // ASA: NAT por objetos, validado en security-checks
    } else if (nat) {
      if (!inside.length || !outside.length) diags.push({ severity: 'error', code: 'NAT-INTERFACES', message: `${d.id}: NAT requiere al menos una interfaz "ip nat inside" y una "ip nat outside".`, subject: { device: d.id } })
      if (nat.overloadInterface) {
        const o = findIface(d, nat.overloadInterface)
        if (!o) diags.push({ severity: 'error', code: 'NAT-OVERLOAD-IF', message: `${d.id}: la interfaz de PAT ${nat.overloadInterface} no existe.`, subject: { device: d.id } })
        else if (o.nat !== 'outside') diags.push({ severity: 'warning', code: 'NAT-OVERLOAD-NOT-OUTSIDE', message: `${d.id}: PAT usa ${o.name}, que no está marcada como nat outside.`, subject: { device: d.id } })
      }
      for (const p of nat.insideSources ?? []) if (!parseCidr4(p)) diags.push({ severity: 'error', code: 'NAT-SOURCE', message: `${d.id}: insideSources contiene un prefijo inválido "${p}".`, subject: { device: d.id } })
      if ((nat.insideSources?.length ?? 0) === 0 && !(nat.static?.length)) diags.push({ severity: 'warning', code: 'NAT-NO-SOURCES', message: `${d.id}: NAT sin insideSources ni traducciones estáticas.`, subject: { device: d.id } })
    } else if (inside.length || outside.length) {
      diags.push({ severity: 'warning', code: 'NAT-FLAGS-ONLY', message: `${d.id}: hay interfaces nat inside/outside pero no hay services.nat.`, subject: { device: d.id } })
    }
  }
}

function checkRoutingConfig(devices: Map<string, NDevice>, diags: Diagnostic[]): void {
  const rids = new Map<string, string>()
  for (const d of devices.values()) {
    const rid = d.routing?.ospf?.routerId
    if (rid) {
      if (rids.has(rid)) diags.push({ severity: 'error', code: 'OSPF-RID-DUP', message: `Router-ID OSPF ${rid} duplicado en ${rids.get(rid)} y ${d.id}.`, subject: { device: d.id } })
      rids.set(rid, d.id)
    }
    if (d.type === 'l3switch' && d.routing?.ipRouting === false) {
      const svis = d.ifaces.filter((i) => i.mode === 'svi' && i.cidr)
      if (svis.length > 1) diags.push({ severity: 'warning', code: 'L3-NO-IP-ROUTING', message: `${d.id}: tiene ${svis.length} SVI pero "ip routing" está deshabilitado; no habrá routing inter-VLAN.`, subject: { device: d.id } })
    }
    if ((d.type === 'switch') && d.routing && (d.routing.ospf || d.routing.eigrp || d.routing.rip || d.routing.static?.length)) {
      diags.push({ severity: 'error', code: 'ROUTING-ON-L2', message: `${d.id} es un switch L2: no ejecuta protocolos ni rutas estáticas (use "gateway").`, subject: { device: d.id } })
    }
    if (d.routing?.rip && (d.routing.rip.version ?? 1) === 1) {
      diags.push({ severity: 'info', code: 'RIP-V1', message: `${d.id}: RIP v1 es classful (sin VLSM). Use "version": 2.`, subject: { device: d.id } })
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
      diags.push({ severity: 'warning', code: 'WEAK-SECRET', message: `${d.id}: usa contraseñas de laboratorio con target de producción (${model.meta.target}).`, subject: { device: d.id } })
    }
    const mod = s.ssh?.modulus ?? 1024
    if (s.ssh && mod < 768) diags.push({ severity: 'error', code: 'SSH-MODULUS', message: `${d.id}: SSH v2 requiere una clave RSA de al menos 768 bits (tiene ${mod}).`, subject: { device: d.id } })
    else if (s.ssh && produccion && mod < 2048) diags.push({ severity: 'info', code: 'SSH-MODULUS-PROD', message: `${d.id}: en producción use claves RSA de 2048 bits o más.`, subject: { device: d.id } })
  }
  for (const d of devices.values()) {
    if (d.extraConfig?.length) diags.push({ severity: 'info', code: 'EXTRA-CONFIG', message: `${d.id}: ${d.extraConfig.length} línea(s) en extraConfig no validadas por la herramienta; verifíquelas manualmente.`, subject: { device: d.id } })
  }
}

function checkTopology(devices: Map<string, NDevice>, links: ResolvedLink[], diags: Diagnostic[]): void {
  const conectados = new Set(links.flatMap((l) => [l.a.dev.id, l.b.dev.id]))
  for (const d of devices.values()) {
    if (!conectados.has(d.id)) diags.push({ severity: 'warning', code: 'DEVICE-ISOLATED', message: `${d.id} no tiene enlaces.`, subject: { device: d.id } })
    for (const i of d.ifaces) {
      if (i.shutdown && links.some((l) => (l.a.iface === i || l.b.iface === i))) {
        diags.push({ severity: 'info', code: 'IF-SHUTDOWN', message: `${d.id} ${i.name} está conectada pero administrativamente apagada (shutdown).`, subject: { device: d.id, interface: i.name } })
      }
    }
  }
}

/** El router HSRP activo de cada VLAN debería ser también el root de STP (evita tráfico por el enlace entre distribuciones). */
function checkStpHsrp(ctx: L3Context, stp: StpResult, diags: Diagnostic[]): void {
  for (const h of ctx.hsrp) {
    if (h.role !== 'active') continue
    const vlan = Number(h.iface.match(/^Vlan(\d+)$/i)?.[1])
    if (!vlan) continue
    const v = stp.vlans.find((x) => x.vlan === vlan && x.ports.some((p) => p.device === h.device))
    if (v && v.root !== h.device) {
      diags.push({ severity: 'warning', code: 'STP-HSRP-MISALIGNED', message: `VLAN ${vlan}: el HSRP activo es ${h.device} pero el root de STP es ${v.root}; el tráfico hacia el gateway cruza un camino extra.`, subject: { device: h.device, vlan }, hint: `Haga a ${h.device} root primary de la VLAN ${vlan} (o el activo HSRP del root).` })
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
      diags.push({ severity: 'error', code: 'TEST-FAILED', message: `Prueba ping ${t.from} → ${t.to}: se esperaba ${expect === 'success' ? 'éxito' : 'fallo'} y el resultado es ${r.status === 'success' ? 'éxito' : 'fallo'}. ${r.status === 'success' ? '' : r.reason}`.trim(), subject: { device: t.from } })
    } else if (passed === null) {
      diags.push({ severity: 'info', code: 'TEST-UNKNOWN', message: `Prueba ping ${t.from} → ${t.to}: no verificable con el modelo (${r.reason}).`, subject: { device: t.from } })
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
