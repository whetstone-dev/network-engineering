// Renderiza el análisis como un HTML autocontenido e interactivo (SVG + JS vanilla, sin CDN).
// El mismo archivo funciona abierto localmente (file://) o publicado como Artifact.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Analysis } from './validate.ts'
import type { Device, Diagnostic, NetworkModel } from './model.ts'
import { HOST_TYPES } from './model.ts'
import { computeLayout } from './layout.ts'
import { generateConfig } from './ios.ts'
import { routeView, routesDevice } from './l3.ts'
import { route6View } from './l3v6.ts'
import type { ModelDiff } from './diff.ts'
import { linkKey } from './diff.ts'
import type { ResolvedLink } from './l2.ts'
import { addressingRows, connectionRows, inventoryRows, portRows, vlanRows } from './docs.ts'
import { cidrKey, formatIpv4 } from './ip.ts'
import { shortIfName } from './names.ts'
import type { NIface } from './normalize.ts'

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets')

function readAsset(nombre: string): string {
  try {
    return readFileSync(join(ASSETS, nombre), 'utf8')
  } catch (e) {
    throw new Error(`No se encontró el recurso del viewer "${nombre}" en ${ASSETS}: ${(e as Error).message}`)
  }
}

function peor(lista: Diagnostic[]): 'error' | 'warning' | null {
  if (lista.some((d) => d.severity === 'error')) return 'error'
  if (lista.some((d) => d.severity === 'warning')) return 'warning'
  return null
}

function ifStatus(i: NIface): string {
  return i.status ?? (i.shutdown ? 'down' : 'up')
}

function vlanText(i: NIface): string {
  if (i.mode === 'access' || i.mode === 'svi' || i.mode === 'subinterface') return i.vlan !== undefined ? String(i.vlan) + (i.native ? ' (nativa)' : '') : ''
  if (i.mode === 'trunk') return `${Array.isArray(i.allowedVlans) ? i.allowedVlans.join(', ') : 'todas'} (nativa ${i.nativeVlan ?? 1})`
  return ''
}

export interface RenderOptions { diff?: ModelDiff; old?: Analysis }

/** Vista L3: routers/firewalls y subredes como nodos; enlaces router ↔ subred. */
function buildL3(a: Analysis): Record<string, unknown> {
  const nodos: Record<string, unknown>[] = []
  const aristas: { a: string; b: string; label: string }[] = []
  const vistos = new Map<string, Record<string, unknown>>()
  const l3devs = [...a.devices.values()].filter((d) => routesDevice(d) || d.type === 'firewall' || d.type === 'internet')
  const ids = new Set(l3devs.map((d) => d.id))
  for (const seg of a.segments) {
    const ruteadas = seg.ifaces.filter((i) => i.cidr && i.mode !== 'loopback' && ids.has(i.deviceId))
    if (!ruteadas.length) continue
    const red = cidrKey(ruteadas[0].cidr!)
    const id = `net:${red}:${seg.id}`
    const hosts = seg.ifaces.filter((i) => i.mode === 'host')
    const hsrp = a.ctx.hsrp.find((h) => h.segment === seg.id && h.role === 'active')
    const nodo = {
      id, kind: 'subnet', label: red, vlans: seg.vlans.filter((v) => v !== 1 || seg.vlans.length === 1), hosts: hosts.length,
      members: [...new Set(seg.ifaces.map((i) => i.deviceId))], switches: seg.devices,
      gateways: ruteadas.map((i) => `${i.deviceId} ${shortIfName(i.name)} ${formatIpv4(i.cidr!.ip)}`), vip: hsrp ? `${hsrp.vip} (activo ${hsrp.device})` : undefined,
    }
    vistos.set(id, nodo)
    nodos.push(nodo)
    for (const i of ruteadas) aristas.push({ a: i.deviceId, b: id, label: `${shortIfName(i.name)} .${formatIpv4(i.cidr!.ip).split('.')[3]}` })
  }
  // posiciones con el mismo motor de layout (las subredes ocupan el lugar de los switches)
  const sinteticos: Device[] = [
    ...l3devs.map((d) => ({ id: d.id, type: d.type, role: d.role, tier: d.tier, interfaces: [] })),
    ...nodos.map((n) => ({ id: String(n.id), type: 'hub' as const, interfaces: [] })),
  ]
  const enlaces = aristas.map((e) => ({ a: { dev: { id: e.a } }, b: { dev: { id: e.b } } })) as unknown as ResolvedLink[]
  const modelo: NetworkModel = { modelVersion: 1, meta: { name: 'l3' }, devices: sinteticos, links: [] }
  const pos = computeLayout(modelo, enlaces).positions
  for (const d of l3devs) nodos.push({ id: d.id, kind: 'router', device: d.id })
  for (const n of nodos) { n.x = pos[String(n.id)]?.x ?? 0; n.y = pos[String(n.id)]?.y ?? 0 }
  return { nodes: nodos, edges: aristas }
}

export function buildViewerData(a: Analysis, opts: RenderOptions = {}): Record<string, unknown> {
  const m = a.model
  const layout = computeLayout(m, a.links)
  const stpPorDispositivo = new Map<string, { rootOf: number[]; blocked: Map<string, number[]> }>()
  const stpDe = (id: string): { rootOf: number[]; blocked: Map<string, number[]> } => {
    if (!stpPorDispositivo.has(id)) stpPorDispositivo.set(id, { rootOf: [], blocked: new Map() })
    return stpPorDispositivo.get(id)!
  }
  // VLAN nativas/blackhole sin tráfico no aportan información visual de STP
  const sinTrafico = new Set((m.vlans ?? []).filter((v) => v.purpose === 'native' || v.purpose === 'blackhole').map((v) => v.id))
  for (const v of a.stp.vlans) {
    if (sinTrafico.has(v.vlan)) continue
    stpDe(v.root).rootOf.push(v.vlan)
    for (const p of v.ports.filter((x) => x.role === 'alternate')) {
      const s = stpDe(p.device)
      s.blocked.set(p.iface, [...(s.blocked.get(p.iface) ?? []), v.vlan])
    }
  }
  const peerOf = new Map<string, { txt: string; link: string }>()
  for (const l of a.links) {
    peerOf.set(`${l.a.dev.id}|${l.a.iface.key}`, { txt: `${l.b.dev.id} ${shortIfName(l.b.iface.name)}`, link: l.id })
    peerOf.set(`${l.b.dev.id}|${l.b.iface.key}`, { txt: `${l.a.dev.id} ${shortIfName(l.a.iface.name)}`, link: l.id })
  }
  const devices = [...a.devices.values()].map((d) => {
    const cfg = generateConfig(m, d.source)
    // las pruebas fallidas no marcan al equipo origen: la causa raíz ya tiene su propio diagnóstico
    const diags = a.diagnostics.filter((x) => x.subject?.device === d.id && !x.subject?.link && !x.code.startsWith('TEST-'))
    const sim = a.ctx.hostIp.get(d.id)
    const servicios: string[] = []
    const s = d.services
    if (s?.dhcp) servicios.push(`DHCP: ${s.dhcp.pools.map((p) => `${p.name} (${p.network})`).join(', ')}`)
    if (s?.nat) servicios.push(`NAT/PAT${s.nat.overloadInterface ? ` sobre ${s.nat.overloadInterface}` : ''}${s.nat.static?.length ? ` · ${s.nat.static.length} estática(s)` : ''}`)
    if (s?.dns) servicios.push(`DNS: ${s.dns.records.map((r) => `${r.name} → ${r.value}`).join(', ')}`)
    for (const k of ['http', 'https', 'ftp', 'tftp', 'email', 'syslog', 'ntp'] as const) if (s?.[k]) servicios.push(k.toUpperCase())
    if (d.security?.ssh) servicios.push(`SSH v2 (usuario ${d.security.ssh.username})`)
    for (const acl of d.acls ?? []) servicios.push(`ACL ${acl.name} (${acl.type}, ${acl.entries.length} entradas)`)
    const r = d.routing
    if (r?.ospf) servicios.push(`OSPF proceso ${r.ospf.processId ?? 1}${r.ospf.routerId ? ` · RID ${r.ospf.routerId}` : ''}`)
    if (r?.eigrp) servicios.push(`EIGRP AS ${r.eigrp.as}`)
    if (r?.rip) servicios.push(`RIP v${r.rip.version ?? 1}`)
    if (r?.bgp) servicios.push(`BGP AS ${r.bgp.as}`)
    // interfaces: los rangos sin enlace se muestran compactos
    const conectadas = new Set(a.links.flatMap((l) => [`${l.a.dev.id}|${l.a.iface.key}`, `${l.b.dev.id}|${l.b.iface.key}`]))
    const vistas = new Set<string>()
    const ifaces: Record<string, unknown>[] = []
    for (const i of d.ifaces) {
      const esRango = i.declaredAs !== i.name && i.declaredAs.includes('-')
      const k = `${d.id}|${i.key}`
      if (esRango && !conectadas.has(k)) {
        if (vistas.has(i.declaredAs)) continue
        vistas.add(i.declaredAs)
        const partes = i.declaredAs.match(/^([A-Za-z-]+)(.*)$/)
        const corto = partes ? shortIfName(`${partes[1]}0`).replace(/0$/, '') + partes[2] : i.declaredAs
        ifaces.push({ name: i.declaredAs, short: corto, mode: i.mode, vlanText: vlanText(i), status: ifStatus(i), peer: '' })
        continue
      }
      const h = a.ctx.hsrp.find((x) => x.device === d.id && x.iface === i.name)
      ifaces.push({
        hsrp: h ? `HSRP ${h.group} ${h.vip} (${h.role === 'active' ? 'activo' : h.role === 'standby' ? 'standby' : 'escucha'}, prio ${h.priority})` : undefined,
        ipv6: i.ipv6?.length ? i.ipv6.join(', ') : undefined,
        name: i.name, short: shortIfName(i.name), mode: i.mode,
        ip: i.cidr ? `${formatIpv4(i.cidr.ip)}/${i.cidr.prefix}` : undefined,
        simIp: i.mode === 'host' && sim?.simulated ? formatIpv4(sim.ip) : undefined,
        dhcp: i.dhcp, vlanText: vlanText(i), status: ifStatus(i), description: i.description,
        peer: peerOf.get(k)?.txt ?? '', confidence: i.confidence,
      })
    }
    return {
      id: d.id, type: d.type, label: d.label, model: d.model, vendor: d.vendor, platform: d.platform, role: d.role, zone: d.zone,
      status: d.status, confidence: d.confidence, notes: d.notes, gateway: d.gateway ?? (sim?.gateway !== undefined && sim.simulated ? `${formatIpv4(sim.gateway)} (DHCP)` : undefined), dns: d.dns,
      x: layout.positions[d.id]?.x ?? 0, y: layout.positions[d.id]?.y ?? 0,
      ifaces, routes: (a.ctx.tables.get(d.id) ?? []).map(routeView), services: servicios,
      routes6: (a.tables6.get(d.id) ?? []).filter((r) => r.proto !== 'L').map(route6View),
      stp: stpPorDispositivo.has(d.id) ? { rootOf: stpDe(d.id).rootOf, blocked: [...stpDe(d.id).blocked].map(([iface, vlans]) => ({ iface, vlans })) } : undefined,
      diff: opts.diff?.devices[d.id],
      config: cfg.text, configKind: cfg.kind, verification: cfg.verification, issue: peor(diags),
    }
  })
  const links = a.links.map((l) => {
    const diags = a.diagnostics.filter((x) => x.subject?.link === l.id)
    const ext = (e: typeof l.a): Record<string, unknown> => ({
      device: e.dev.id, iface: e.iface.name, short: shortIfName(e.iface.name),
      ip: e.iface.cidr && !HOST_TYPES.has(e.dev.type) ? `.${formatIpv4(e.iface.cidr.ip).split('.')[3]}` : undefined,
      status: e.iface.status ?? (e.iface.shutdown ? 'down' : l.link.status === 'down' ? 'down' : 'up'),
      stpBlocked: ((e === l.a ? a.stp.blocked.get(l.id)?.a : a.stp.blocked.get(l.id)?.b) ?? []).filter((v) => !sinTrafico.has(v)),
    })
    const subred = [l.a.iface, l.b.iface].find((i) => i.cidr && i.mode === 'routed')
    const caida = l.link.status === 'down' || l.a.iface.shutdown || l.b.iface.shutdown
    return {
      id: l.id, a: ext(l.a), b: ext(l.b), medium: l.link.medium, status: l.link.status ?? (caida ? 'down' : 'up'),
      kind: l.kind, vlans: l.vlans, subnet: subred?.cidr ? cidrKey(subred.cidr) : undefined, label: l.link.label,
      confidence: l.link.confidence, speed: l.link.speed, issue: peor(diags),
      diff: opts.diff?.links[linkKey(l)],
    }
  })
  // Diff: equipos y enlaces eliminados se muestran como "fantasmas" en su posición anterior
  if (opts.diff && opts.old) {
    const viejoLayout = computeLayout(opts.old.model, opts.old.links)
    for (const [id, st] of Object.entries(opts.diff.devices)) {
      if (st !== 'removed') continue
      const d = opts.old.devices.get(id)!
      devices.push({
        id, type: d.type, label: d.label, model: d.model, ghost: true, diff: 'removed', ifaces: [], routes: [], routes6: [], services: [], config: '', configKind: 'gui', verification: [],
        x: viejoLayout.positions[id]?.x ?? 0, y: viejoLayout.positions[id]?.y ?? 0,
      } as unknown as (typeof devices)[number])
    }
    for (const l of opts.old.links) {
      if (opts.diff.links[linkKey(l)] !== 'removed') continue
      links.push({
        id: `old-${l.id}`, ghost: true, diff: 'removed', kind: l.kind, vlans: l.vlans, medium: l.link.medium, status: 'down',
        a: { device: l.a.dev.id, iface: l.a.iface.name, short: shortIfName(l.a.iface.name), status: 'down', stpBlocked: [] },
        b: { device: l.b.dev.id, iface: l.b.iface.name, short: shortIfName(l.b.iface.name), status: 'down', stpBlocked: [] },
      } as unknown as (typeof links)[number])
    }
  }
  const vlanDevices: Record<string, string[]> = {}
  for (const [v, s] of a.vlanDevices) vlanDevices[String(v)] = [...s]
  return {
    meta: m.meta ?? { name: 'Red' },
    vlans: (m.vlans ?? []).map((v) => ({ id: v.id, name: v.name, subnet: v.subnet, gateway: v.gateway, color: v.color })),
    devices, links, zones: m.zones ?? [], vlanDevices,
    diagnostics: a.diagnostics, counts: a.counts,
    tests: a.tests,
    hsrp: a.ctx.hsrp,
    stp: a.stp.vlans.map((v) => ({ vlan: v.vlan, root: v.root, blocked: v.ports.filter((p) => p.role === 'alternate').map((p) => `${p.device} ${p.iface}`) })),
    l3: buildL3(a),
    diff: opts.diff ? { changes: opts.diff.changes.slice(0, 400), introduced: opts.diff.introduced, resolved: opts.diff.resolved, tests: opts.diff.tests, oldName: opts.old?.model.meta?.name } : undefined,
    tables: { addressing: addressingRows(a), vlans: vlanRows(a), connections: connectionRows(a), ports: portRows(a), inventory: inventoryRows(a) },
  }
}

function escHtml(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

export function renderHtml(a: Analysis, opts: RenderOptions = {}): string {
  const data = buildViewerData(a, opts)
  // JSON seguro dentro de <script>: escapa '<' y los separadores de línea U+2028/U+2029
  const barra = String.fromCharCode(92)
  const json = JSON.stringify(data)
    .split('<').join(`${barra}u003c`)
    .split(String.fromCharCode(0x2028)).join(`${barra}u2028`)
    .split(String.fromCharCode(0x2029)).join(`${barra}u2029`)
  const nombre = a.model.meta?.name ?? 'Topología de red'
  const sub = [a.model.meta?.target ?? 'packet-tracer', `${a.devices.size} equipos`, `${a.links.length} enlaces`, a.model.meta?.description ?? ''].filter(Boolean).join(' · ')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(nombre.length > 60 ? 'Topología de red' : nombre)}</title>
<style id="viewer-css">${readAsset('viewer.css')}</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="title"><h1>${escHtml(nombre)}</h1><p>${escHtml(sub)}</p></div>
    <div class="controls">
      <span class="badge" id="badge-err" title="Errores de validación"><span class="dot" style="background:var(--err)"></span>${a.counts.error}</span>
      <span class="badge" id="badge-warn" title="Advertencias"><span class="dot" style="background:var(--warn)"></span>${a.counts.warning}</span>
      <input id="q" class="search" type="search" placeholder="Buscar equipo o IP  ( / )" aria-label="Buscar">
      <select id="vlan" aria-label="Filtrar por VLAN"><option value="">Todas las VLAN</option></select>
      <span class="group" role="group" aria-label="Vista">
        <button class="btn" id="v-phys" aria-pressed="true" title="Topología física (cableado)">Física</button><button class="btn" id="v-l3" aria-pressed="false" title="Topología lógica L3 (routers y subredes)">L3</button>
      </span>
      <span class="group" role="group" aria-label="Capas">
        <button class="btn" id="t-ports" aria-pressed="true" title="Interfaces en los extremos">Puertos</button>
        <button class="btn" id="t-ips" aria-pressed="true" title="IP bajo cada equipo">IP</button>
        <button class="btn" id="t-mid" aria-pressed="true" title="Subred / VLAN en cada enlace">Etiquetas</button>
        <button class="btn" id="t-vlan" aria-pressed="true" title="Colorear enlaces access por VLAN">Color VLAN</button>
      </span>
      <span class="group" role="group" aria-label="Vista">
        <button class="btn" id="zout" title="Alejar">−</button><button class="btn" id="fit" title="Ajustar (F)">Ajustar</button><button class="btn" id="zin" title="Acercar">+</button>
        <button class="btn" id="theme" title="Tema claro/oscuro">Tema</button>
      </span>
      <span class="group" role="group" aria-label="Exportar">
        <button class="btn" id="x-svg">SVG</button><button class="btn" id="x-png">PNG</button><button class="btn" id="x-layout" title="Posiciones para guardar en el modelo">Layout</button>
      </span>
    </div>
  </header>
  <div class="main">
    <div class="canvas" id="canvas">
      <svg id="net-svg" role="img" aria-label="Diagrama de topología de red"></svg>
      <div class="hint">Rueda: zoom · Arrastrar: mover · Clic: inspeccionar</div>
      <div class="legend" aria-label="Leyenda">
        <span><i></i>Cobre</span><span><i style="border-top-style:dashed"></i>Cruzado</span><span><i style="border-top-width:4px"></i>Trunk</span>
        <span><i style="border-color:var(--serial)"></i>Serial</span><span><i style="border-color:var(--fiber)"></i>Fibra</span>
        <span><i style="border-color:var(--wireless);border-top-style:dotted"></i>Inalámbrico</span>
        <span><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="var(--ok)"/></svg>UP</span>
        <span><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="var(--down)"/></svg>DOWN</span>
        <span><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="var(--warn)"/></svg>WARNING · STP bloq.</span>
        <span>Borde punteado: inferido</span>
      </div>
    </div>
    <aside class="side">
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="inspector">Inspector</button>
        <button class="tab" role="tab" data-tab="diags">Diagnóstico (<span id="n-diags">0</span>)</button>
        <button class="tab" role="tab" data-tab="tables">Tablas</button>
        <button class="tab" role="tab" data-tab="tests">Pruebas (<span id="n-tests">0</span>)</button>
        <button class="tab" role="tab" data-tab="diff" id="tab-diff" hidden>Cambios</button>
      </div>
      <div class="pane" id="pane-inspector" role="tabpanel"></div>
      <div class="pane" id="pane-diags" role="tabpanel" hidden></div>
      <div class="pane" id="pane-tables" role="tabpanel" hidden></div>
      <div class="pane" id="pane-tests" role="tabpanel" hidden></div>
      <div class="pane" id="pane-diff" role="tabpanel" hidden></div>
    </aside>
  </div>
</div>
<dialog id="dlg"><div class="row"><h2 id="dlg-title" style="font-size:15px;margin:0"></h2><button class="btn" id="dlg-close">Cerrar</button></div><p></p><textarea id="dlg-text" readonly></textarea></dialog>
<script id="net-data" type="application/json">${json}</script>
<script>${readAsset('viewer.js')}</script>
</body>
</html>
`
}
