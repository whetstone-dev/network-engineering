// Documentación de infraestructura derivada del análisis (Markdown) y tablas reutilizables por el viewer.

import type { Analysis } from './validate.ts'
import { HOST_TYPES } from './model.ts'
import { cidrKey, formatIpv4, prefixToMask, subnetInfo } from './ip.ts'
import { shortIfName, naturalCompare } from './names.ts'
import type { GeneratedConfig } from './ios.ts'
import { generateConfig } from './ios.ts'
import { routeView } from './l3.ts'
import { hardwareNotes } from './catalog.ts'
import { route6View } from './l3v6.ts'

export type Row = Record<string, string>

export function inventoryRows(a: Analysis): Row[] {
  return [...a.devices.values()].map((d) => ({
    Dispositivo: d.id,
    Tipo: d.type,
    Modelo: d.model ?? '-',
    Plataforma: d.platform ?? '-',
    Rol: d.role ?? '-',
    Zona: d.zone ?? '-',
    Interfaces: String(d.ifaces.length),
    Hardware: hardwareNotes(d.model, d.ifaces.map((i) => i.name)).join('; ') || '-',
    Estado: d.status ?? 'según diseño',
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
      filas.push({ Dispositivo: d.id, Interfaz: i.name, IP: ip, 'Máscara': mascara, Gateway: gw, VLAN: vlan, 'Descripción': i.description ?? '' })
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
      } catch { /* subred inválida: ya se reporta en diagnósticos */ }
    }
    const equipos = [...(a.vlanDevices.get(v.id) ?? [])].sort(naturalCompare)
    return {
      VLAN: String(v.id), Nombre: v.name, Red: v.subnet ?? '-', Gateway: v.gateway ?? '-',
      'Rango útil': rango, Hosts: hosts, Uso: v.purpose ?? '-', Equipos: equipos.join(', ') || '-',
    }
  })
}

export function connectionRows(a: Analysis): Row[] {
  return a.links.map((l) => {
    const subred = [l.a.iface, l.b.iface].find((i) => i.cidr)
    return {
      Enlace: l.id,
      'Origen': `${l.a.dev.id} ${shortIfName(l.a.iface.name)}`,
      'Destino': `${l.b.dev.id} ${shortIfName(l.b.iface.name)}`,
      Medio: l.link.medium ?? '-',
      Tipo: l.kind,
      VLAN: l.vlans.length ? l.vlans.join(',') : '-',
      Subred: subred?.cidr ? cidrKey(subred.cidr) : '-',
      Estado: l.link.status ?? (l.a.iface.shutdown || l.b.iface.shutdown ? 'down' : 'up'),
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
        Puertos: decl.name,
        Modo: n.mode,
        VLAN: n.mode === 'access' ? String(n.vlan ?? 1) : n.mode === 'trunk' ? `nativa ${n.nativeVlan ?? 1}; permitidas ${Array.isArray(n.allowedVlans) ? n.allowedVlans.join(',') : 'todas'}` : '-',
        Seguridad: [n.portSecurity ? 'port-security' : '', n.portfast ? 'portfast' : '', n.bpduguard ? 'bpduguard' : '', n.channelGroup ? `Po${n.channelGroup.id} (${n.channelGroup.mode})` : ''].filter(Boolean).join(', ') || '-',
        Conectado: conectado.join(', ') || '-',
      })
    }
  }
  return filas
}

export function mdTable(filas: Row[]): string {
  if (!filas.length) return '_Sin datos._\n'
  const cols = Object.keys(filas[0])
  const esc = (t: string): string => t.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...filas.map((f) => `| ${cols.map((c) => esc(f[c] ?? '')).join(' | ')} |`)].join('\n') + '\n'
}

export function buildDocs(a: Analysis, configs?: GeneratedConfig[]): string {
  const m = a.model
  const cfgs = configs ?? m.devices.map((d) => generateConfig(m, d))
  const L: string[] = []
  const tipos = new Map<string, number>()
  for (const d of a.devices.values()) tipos.set(d.type, (tipos.get(d.type) ?? 0) + 1)
  L.push(`# ${m.meta?.name ?? 'Red'}`, '')
  if (m.meta?.description) L.push(m.meta.description, '')
  L.push('> Documento generado desde el modelo de red (fuente única de verdad). No editar a mano: modifique el modelo y regenere.', '')
  L.push('## Contenido', '- [Resumen ejecutivo](#resumen-ejecutivo)', '- [Inventario](#inventario)', '- [VLAN](#vlan)', '- [Direccionamiento](#direccionamiento)',
    '- [Conexiones](#conexiones)', '- [Puertos de switch](#puertos-de-switch)', '- [Redundancia y Spanning Tree](#redundancia-y-spanning-tree)', '- [Routing](#routing)', '- [Validación](#validación)', '- [Pruebas](#pruebas)',
    '- [Configuraciones](#configuraciones)', '- [Verificación](#verificación)', '')
  L.push('## Resumen ejecutivo', '')
  L.push(`- Plataforma objetivo: **${m.meta?.target ?? 'packet-tracer'}**${m.meta?.level ? ` · nivel ${m.meta.level}` : ''}`)
  L.push(`- Dispositivos: **${a.devices.size}** (${[...tipos].map(([t, n]) => `${n} ${t}`).join(', ')})`)
  L.push(`- Enlaces: **${a.links.length}** · VLAN: **${(m.vlans ?? []).length}** · Dominios L2 con IP: **${a.segments.filter((s) => s.ifaces.some((i) => i.cidr)).length}**`)
  const protos = new Set<string>()
  for (const d of a.devices.values()) for (const k of ['ospf', 'eigrp', 'rip', 'bgp'] as const) if (d.routing?.[k]) protos.add(k.toUpperCase())
  if ([...a.devices.values()].some((d) => d.routing?.static?.length)) protos.add('estático')
  L.push(`- Routing: ${protos.size ? [...protos].join(', ') : 'solo redes conectadas'}`)
  const servicios = new Set<string>()
  for (const d of a.devices.values()) {
    if (d.services?.dhcp) servicios.add(`DHCP (${d.id})`)
    if (d.services?.nat) servicios.add(`NAT/PAT (${d.id})`)
    if (d.services?.dns) servicios.add(`DNS (${d.id})`)
    if (d.security?.ssh) servicios.add(`SSH (${d.id})`)
  }
  if (servicios.size) L.push(`- Servicios: ${[...servicios].join(', ')}`)
  const ok = a.tests.filter((t) => t.passed === true).length
  L.push(`- Validación: **${a.counts.error} errores**, ${a.counts.warning} advertencias, ${a.counts.info} notas · Pruebas: ${ok}/${a.tests.length} correctas`, '')
  L.push('## Inventario', '', mdTable(inventoryRows(a)))
  L.push('## VLAN', '', mdTable(vlanRows(a)))
  L.push('## Direccionamiento', '', mdTable(addressingRows(a)))
  L.push('## Conexiones', '', mdTable(connectionRows(a)))
  L.push('## Puertos de switch', '', mdTable(portRows(a)))
  L.push('## Redundancia y Spanning Tree', '')
  if (a.ctx.hsrp.length) {
    L.push('### HSRP', '', mdTable(a.ctx.hsrp.map((h) => ({ Grupo: String(h.group), 'IP virtual': h.vip, Equipo: h.device, Interfaz: h.iface, Prioridad: String(h.priority), Rol: h.role === 'active' ? 'activo' : h.role === 'standby' ? 'standby' : 'escucha' }))))
  }
  if (a.stp.vlans.length) {
    L.push('### Spanning Tree (simulado)', '', mdTable(a.stp.vlans.map((v) => ({ VLAN: String(v.vlan), 'Root bridge': v.root, Prioridad: String(v.rootPriority), Bloqueados: v.ports.filter((p) => p.role === 'alternate').map((p) => `${p.device} ${p.iface}`).join(', ') || '-' }))))
  }
  if (!a.ctx.hsrp.length && !a.stp.vlans.length) L.push('_Sin HSRP ni dominios STP con más de un switch._', '')
  L.push('## Routing', '')
  for (const [id, tabla] of a.ctx.tables) {
    L.push(`### ${id}`, '', '```', ...tabla.map((r) => { const v = routeView(r); return `${v.code.padEnd(3)} ${v.prefix.padEnd(18)} ${v.adMetric.padEnd(8)} ${v.via}${v.iface ? `, ${v.iface}` : ''}` }), '```', '')
  }
  for (const [id, tabla] of a.tables6) {
    const t = tabla.filter((r) => r.proto !== 'L').map(route6View)
    if (t.length) L.push(`### ${id} (IPv6)`, '', '```', ...t.map((v) => `${v.code.padEnd(4)} ${v.prefix.padEnd(26)} ${v.adMetric.padEnd(8)} ${v.via}${v.iface ? `, ${v.iface}` : ''}`), '```', '')
  }
  L.push('_Tablas simuladas a partir del modelo: OSPF usa costo ref-bw/bw y EIGRP la métrica compuesta (K1=K3=1) como IOS; RIP cuenta saltos. Con caminos de igual costo se muestra uno solo (IOS instala hasta 4)._', '')
  L.push('## Validación', '')
  if (!a.diagnostics.length) L.push('Sin hallazgos.', '')
  for (const d of a.diagnostics) L.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}${d.hint ? ` _(${d.hint})_` : ''}`)
  L.push('')
  L.push('## Pruebas', '')
  if (!a.tests.length) L.push('_No hay pruebas definidas en el modelo._', '')
  for (const t of a.tests) {
    const icono = t.passed === true ? 'OK' : t.passed === false ? 'FALLA' : '¿?'
    L.push(`- **${icono}** ping ${t.from} → ${t.to} (esperado: ${t.expect}) — ${t.reason}${t.description ? ` · ${t.description}` : ''}`)
    if (t.forward.length) L.push(`  - Ida: ${t.forward.map((h) => h.device + (h.note ? ` [${h.note}]` : '')).join(' → ')}`)
    if (t.reverse.length) L.push(`  - Vuelta: ${t.reverse.map((h) => h.device + (h.note ? ` [${h.note}]` : '')).join(' → ')}`)
  }
  L.push('')
  L.push('## Configuraciones', '')
  for (const c of cfgs) {
    L.push(`### ${c.device}`, '', c.kind === 'gui' ? c.text : '```\n' + c.text + '```', '')
  }
  L.push('## Verificación', '')
  for (const c of cfgs) if (c.verification.length) L.push(`- **${c.device}**: ${c.verification.map((v) => `\`${v}\``).join(', ')}`)
  L.push('')
  return L.join('\n')
}
