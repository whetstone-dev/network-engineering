// Secondary export to Mermaid (for Markdown/README documentation).
// Not interactive: the main diagram is the viewer HTML.

import type { Analysis } from './validate.ts'
import { HOST_TYPES } from './model.ts'
import { cidrKey } from './ip.ts'
import { shortIfName } from './names.ts'

const FORMA: Record<string, [string, string]> = {
  router: ['((', '))'], l3switch: ['[[', ']]'], switch: ['[', ']'], firewall: ['{{', '}}'],
  cloud: ['>', ']'], internet: ['>', ']'], server: ['[(', ')]'],
}

function idSeguro(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

function txt(t: string): string {
  return t.replace(/"/g, "'")
}

export function toMermaid(a: Analysis): string {
  const L: string[] = ['flowchart TB']
  const zonas = new Map<string, string[]>()
  for (const z of a.model.zones ?? []) zonas.set(z.id, z.devices)
  const enZona = new Set([...zonas.values()].flat())
  const nodo = (id: string): string => {
    const d = a.devices.get(id)!
    const [ini, fin] = FORMA[d.type] ?? (HOST_TYPES.has(d.type) ? ['(', ')'] : ['[', ']'])
    return `  ${idSeguro(id)}${ini}"${txt(d.label ?? d.id)}<br/><small>${txt(d.model ?? d.type)}</small>"${fin}`
  }
  for (const [z, miembros] of zonas) {
    const zona = a.model.zones!.find((x) => x.id === z)!
    L.push(`  subgraph ${idSeguro(z)}["${txt(zona.label ?? z)}"]`)
    for (const m of miembros) if (a.devices.has(m)) L.push('  ' + nodo(m))
    L.push('  end')
  }
  for (const id of a.devices.keys()) if (!enZona.has(id)) L.push(nodo(id))
  for (const l of a.links) {
    const sub = [l.a.iface, l.b.iface].find((i) => i.cidr && i.mode === 'routed')
    const extra = l.kind === 'trunk' ? ` · trunk ${l.vlans.join(',')}` : sub?.cidr ? ` · ${cidrKey(sub.cidr)}` : l.vlans.length === 1 && l.vlans[0] !== 1 ? ` · VLAN ${l.vlans[0]}` : ''
    const flecha = l.link.medium === 'wireless' ? '-.-' : l.kind === 'trunk' ? '===' : '---'
    L.push(`  ${idSeguro(l.a.dev.id)} ${flecha}|"${txt(shortIfName(l.a.iface.name))} ↔ ${txt(shortIfName(l.b.iface.name))}${txt(extra)}"| ${idSeguro(l.b.dev.id)}`)
  }
  return L.join('\n') + '\n'
}
