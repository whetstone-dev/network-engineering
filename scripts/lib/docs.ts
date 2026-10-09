// Infrastructure documentation derived from the analysis (Markdown) and tables reused by the viewer.

import type { Analysis } from './validate.ts'
import { HOST_TYPES } from './model.ts'
import { cidrKey, formatIpv4, prefixToMask, subnetInfo } from './ip.ts'
import { shortIfName, naturalCompare } from './names.ts'
import type { GeneratedConfig } from './ios.ts'
import { generateConfig } from './ios.ts'
import { redactText, secretValues } from './safety.ts'
import { routeView } from './l3.ts'
import { hardwareNotes } from './catalog.ts'
import { route6View } from './l3v6.ts'

export type Row = Record<string, string>

export function inventoryRows(a: Analysis): Row[] {
  return [...a.devices.values()].map((d) => ({
    Device: d.id,
    Type: d.type,
    Model: d.model ?? '-',
    Platform: d.platform ?? '-',
    Role: d.role ?? '-',
    Zone: d.zone ?? '-',
    Interfaces: String(d.ifaces.length),
    Hardware: hardwareNotes(d.model, d.ifaces.map((i) => i.name)).join('; ') || '-',
    Status: d.status ?? 'as designed',
  }))
}

export function addressingRows(a: Analysis): Row[] {
  const filas: Row[] = []
  for (const d of a.devices.values()) {
    for (const i of d.ifaces) {
      const sim = a.ctx.hostIp.get(d.id)
      if (!i.cidr && !(i.mode === 'host' && i.dhcp)) continue
      const seg = a.segmentOf.get(`${d.id}|${i.key}`)
      const vlan = i.vlan !== undefined && (i.mode === 'svi' || i.mode === 'subinterface') ? String(i.vlan) : seg?.vlans.length ? seg.vlans.join(',') : '-'
      let ip = '-'
      let mascara = '-'
      if (i.cidr) { ip = formatIpv4(i.cidr.ip); mascara = prefixToMask(i.cidr.prefix) }
      else if (sim) { ip = `DHCP (${formatIpv4(sim.ip)})`; mascara = prefixToMask(sim.prefix) }
      const gw = HOST_TYPES.has(d.type) || d.type === 'switch'
        ? d.gateway ?? (sim?.gateway !== undefined ? formatIpv4(sim.gateway) : '-')
        : '-'
      filas.push({ Device: d.id, Interface: i.name, IP: ip, Mask: mascara, Gateway: gw, VLAN: vlan, Description: i.description ?? '' })
    }
  }
  return filas
}

export function vlanRows(a: Analysis): Row[] {
  return (a.model.vlans ?? []).map((v) => {
    let hosts = '-'
    let rango = '-'
    if (v.subnet) {
      try {
        const s = subnetInfo(v.subnet)
        hosts = String(s.usableHosts)
        rango = `${s.firstHost} – ${s.lastHost}`
      } catch { /* invalid subnet: already reported in diagnostics */ }
    }
    const equipos = [...(a.vlanDevices.get(v.id) ?? [])].sort(naturalCompare)
    return {
      VLAN: String(v.id), Name: v.name, Network: v.subnet ?? '-', Gateway: v.gateway ?? '-',
      'Usable range': rango, Hosts: hosts, Purpose: v.purpose ?? '-', Devices: equipos.join(', ') || '-',
    }
  })
}

export function connectionRows(a: Analysis): Row[] {
  return a.links.map((l) => {
    const subred = [l.a.iface, l.b.iface].find((i) => i.cidr)
    return {
      Link: l.id,
      Source: `${l.a.dev.id} ${shortIfName(l.a.iface.name)}`,
      Target: `${l.b.dev.id} ${shortIfName(l.b.iface.name)}`,
      Medium: l.link.medium ?? '-',
      Type: l.kind,
      VLAN: l.vlans.length ? l.vlans.join(',') : '-',
      Subnet: subred?.cidr ? cidrKey(subred.cidr) : '-',
      Status: l.link.status ?? (l.a.iface.shutdown || l.b.iface.shutdown ? 'down' : 'up'),
    }
  })
}

export function portRows(a: Analysis): Row[] {
  const filas: Row[] = []
  for (const d of a.devices.values()) {
    if (d.type !== 'switch' && d.type !== 'l3switch') continue
    for (const decl of d.source.interfaces) {
      const n = d.ifaces.find((i) => i.declaredAs === decl.name)
      if (!n || n.mode === 'svi' || n.mode === 'loopback') continue
      const conectado = a.links.filter((l) => (l.a.dev.id === d.id && l.a.iface.declaredAs === decl.name) || (l.b.dev.id === d.id && l.b.iface.declaredAs === decl.name))
        .map((l) => (l.a.dev.id === d.id ? `${l.b.dev.id} ${shortIfName(l.b.iface.name)}` : `${l.a.dev.id} ${shortIfName(l.a.iface.name)}`))
      filas.push({
        Switch: d.id,
        Ports: decl.name,
        Mode: n.mode,
        VLAN: n.mode === 'access' ? String(n.vlan ?? 1) : n.mode === 'trunk' ? `native ${n.nativeVlan ?? 1}; allowed ${Array.isArray(n.allowedVlans) ? n.allowedVlans.join(',') : 'all'}` : '-',
        Security: [n.portSecurity ? 'port-security' : '', n.portfast ? 'portfast' : '', n.bpduguard ? 'bpduguard' : '', n.channelGroup ? `Po${n.channelGroup.id} (${n.channelGroup.mode})` : ''].filter(Boolean).join(', ') || '-',
        'Connected to': conectado.join(', ') || '-',
      })
    }
  }
  return filas
}

export function mdTable(filas: Row[]): string {
  if (!filas.length) return '_No data._\n'
  const cols = Object.keys(filas[0])
  const esc = (t: string): string => t.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...filas.map((f) => `| ${cols.map((c) => esc(f[c] ?? '')).join(' | ')} |`)].join('\n') + '\n'
}

export function buildDocs(a: Analysis, configs?: GeneratedConfig[]): string {
  const m = a.model
  // Documentation always regenerates sanitized previews, even if restricted configs were supplied.
  const cfgs = (configs ?? [...a.devices.values()].map((d) => ({ device: d.id }))).map((c) => {
    const d = a.devices.get(c.device)!.source
    return a.diagnostics.some((x) => x.code === 'SCHEMA-UNKNOWN-FIELD')
      ? { device: d.id, kind: 'unsupported', text: '! Configuration preview unavailable: fix unknown model fields first.', verification: [] as string[] }
      : generateConfig(m, d)
  })
  const L: string[] = []
  const tipos = new Map<string, number>()
  for (const d of a.devices.values()) tipos.set(d.type, (tipos.get(d.type) ?? 0) + 1)
  L.push(`# ${m.meta?.name ?? 'Network'}`, '')
  if (m.meta?.description) L.push(m.meta.description, '')
  L.push('> Document generated from the network model (single source of truth). Do not edit by hand: change the model and regenerate.', '')
  L.push('> Tests and routes are modeled, not observed on devices. Configurations are redacted previews; apply, verify and save are separate actions.', '')
  L.push('## Contents', '- [Executive summary](#executive-summary)', '- [Inventory](#inventory)', '- [VLANs](#vlans)', '- [Addressing](#addressing)',
    '- [Connections](#connections)', '- [Switch ports](#switch-ports)', '- [Redundancy and Spanning Tree](#redundancy-and-spanning-tree)', '- [Routing](#routing)', '- [Validation](#validation)', '- [Tests](#tests)',
    '- [Configurations](#configurations)', '- [Verification](#verification)', '')
  L.push('## Executive summary', '')
  L.push(`- Target platform: **${m.meta?.target ?? 'packet-tracer'}**${m.meta?.level ? ` · level ${m.meta.level}` : ''}`)
  L.push(`- Devices: **${a.devices.size}** (${[...tipos].map(([t, n]) => `${n} ${t}`).join(', ')})`)
  L.push(`- Links: **${a.links.length}** · VLANs: **${(m.vlans ?? []).length}** · L2 domains with IP: **${a.segments.filter((s) => s.ifaces.some((i) => i.cidr)).length}**`)
  const protos = new Set<string>()
  for (const d of a.devices.values()) for (const k of ['ospf', 'eigrp', 'rip', 'bgp'] as const) if (d.routing?.[k]) protos.add(k.toUpperCase())
  if ([...a.devices.values()].some((d) => d.routing?.static?.length)) protos.add('static')
  L.push(`- Routing: ${protos.size ? [...protos].join(', ') : 'connected networks only'}`)
  const servicios = new Set<string>()
  for (const d of a.devices.values()) {
    if (d.services?.dhcp) servicios.add(`DHCP (${d.id})`)
    if (d.services?.nat) servicios.add(`NAT/PAT (${d.id})`)
    if (d.services?.dns) servicios.add(`DNS (${d.id})`)
    if (d.security?.ssh) servicios.add(`SSH (${d.id})`)
  }
  if (servicios.size) L.push(`- Services: ${[...servicios].join(', ')}`)
  const ok = a.tests.filter((t) => t.passed === true).length
  L.push(`- Validation: **${a.counts.error} errors**, ${a.counts.warning} warnings, ${a.counts.info} notes · Tests: ${ok}/${a.tests.length} passed`, '')
  L.push('## Inventory', '', mdTable(inventoryRows(a)))
  L.push('## VLANs', '', mdTable(vlanRows(a)))
  L.push('## Addressing', '', mdTable(addressingRows(a)))
  L.push('## Connections', '', mdTable(connectionRows(a)))
  L.push('## Switch ports', '', mdTable(portRows(a)))
  L.push('## Redundancy and Spanning Tree', '')
  if (a.ctx.hsrp.length) {
    L.push('### HSRP', '', mdTable(a.ctx.hsrp.map((h) => ({ Group: String(h.group), 'Virtual IP': h.vip, Device: h.device, Interface: h.iface, Priority: String(h.priority), Role: h.role }))))
  }
  if (a.stp.vlans.length) {
    L.push('### Spanning Tree (simulated)', '', mdTable(a.stp.vlans.map((v) => ({ VLAN: String(v.vlan), 'Root bridge': v.root, Priority: String(v.rootPriority), Blocked: v.ports.filter((p) => p.role === 'alternate').map((p) => `${p.device} ${p.iface}`).join(', ') || '-' }))))
  }
  if (!a.ctx.hsrp.length && !a.stp.vlans.length) L.push('_No HSRP and no STP domains with more than one switch._', '')
  L.push('## Routing', '')
  for (const [id, tabla] of a.ctx.tables) {
    L.push(`### ${id}`, '', '```', ...tabla.map((r) => { const v = routeView(r); return `${v.code.padEnd(3)} ${v.prefix.padEnd(18)} ${v.adMetric.padEnd(8)} ${v.via}${v.iface ? `, ${v.iface}` : ''}` }), '```', '')
  }
  for (const [id, tabla] of a.tables6) {
    const t = tabla.filter((r) => r.proto !== 'L').map(route6View)
    if (t.length) L.push(`### ${id} (IPv6)`, '', '```', ...t.map((v) => `${v.code.padEnd(4)} ${v.prefix.padEnd(26)} ${v.adMetric.padEnd(8)} ${v.via}${v.iface ? `, ${v.iface}` : ''}`), '```', '')
  }
  L.push('_Tables simulated from the model: OSPF uses cost ref-bw/bw and EIGRP the composite metric (K1=K3=1), as IOS does; RIP counts hops. With equal-cost paths only one is shown (IOS installs up to 4)._', '')
  L.push('## Validation', '')
  if (!a.diagnostics.length) L.push('No findings.', '')
  for (const d of a.diagnostics) L.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${redactText(d.message, secretValues(m))}${d.hint ? ` _(${redactText(d.hint, secretValues(m))})_` : ''}`)
  L.push('')
  L.push('## Tests', '')
  if (!a.tests.length) L.push('_No tests are defined in the model._', '')
  for (const t of a.tests) {
    const icono = t.passed === true ? 'OK' : t.passed === false ? 'FAIL' : '?'
    L.push(`- **${icono}** ping ${t.from} → ${t.to} (expected: ${t.expect}) — ${t.reason}${t.description ? ` · ${t.description}` : ''}`)
    if (t.forward.length) L.push(`  - Forward: ${t.forward.map((h) => h.device + (h.note ? ` [${h.note}]` : '')).join(' → ')}`)
    if (t.reverse.length) L.push(`  - Return: ${t.reverse.map((h) => h.device + (h.note ? ` [${h.note}]` : '')).join(' → ')}`)
  }
  L.push('')
  L.push('## Configurations', '')
  for (const c of cfgs) {
    L.push(`### ${c.device}`, '', c.kind === 'gui' ? c.text : '```\n' + c.text + '```', '')
  }
  L.push('## Verification', '')
  for (const c of cfgs) if (c.verification.length) L.push(`- **${c.device}**: ${c.verification.map((v) => `\`${v}\``).join(', ')}`)
  L.push('')
  return L.join('\n')
}
