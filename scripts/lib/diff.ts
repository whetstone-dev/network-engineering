// Differences between two versions of a network model: devices, interfaces, links, VLANs,
// introduced/resolved diagnostics and changes in test results.

import type { Diagnostic } from './model.ts'
import type { Analysis } from './validate.ts'
import type { ResolvedLink } from './l2.ts'

export type DiffState = 'added' | 'removed' | 'changed'

export interface Change { subject: string; kind: DiffState; path: string; before?: unknown; after?: unknown }

export interface ModelDiff {
  devices: Record<string, DiffState>
  links: Record<string, DiffState>          // canonical link key
  linkKeyOld: Record<string, string>        // link id in the previous model → key
  linkKeyNew: Record<string, string>
  changes: Change[]
  introduced: Diagnostic[]
  resolved: Diagnostic[]
  tests: { test: string; before: string | null; after: string | null }[]
}

export function linkKey(l: ResolvedLink): string {
  return [`${l.a.dev.id}:${l.a.iface.name}`, `${l.b.dev.id}:${l.b.iface.name}`].sort().join(' ↔ ')
}

function clave(x: unknown): string | undefined {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>
    if (typeof o.from === 'string' && typeof o.to === 'string') return `${o.from} → ${o.to}`
    for (const k of ['name', 'id', 'prefix', 'from']) if (typeof o[k] === 'string') return String(o[k])
  }
  return undefined
}

/** Deep diff; arrays of objects with name/id are compared by that key. */
function comparar(a: unknown, b: unknown, path: string, subject: string, out: Change[]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return
  if (a === undefined) { out.push({ subject, kind: 'added', path, after: b }); return }
  if (b === undefined) { out.push({ subject, kind: 'removed', path, before: a }); return }
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => clave(x)) && b.every((x) => clave(x))) {
    const ma = new Map(a.map((x) => [clave(x)!, x]))
    const mb = new Map(b.map((x) => [clave(x)!, x]))
    for (const k of new Set([...ma.keys(), ...mb.keys()])) comparar(ma.get(k), mb.get(k), `${path}[${k}]`, subject, out)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const oa = a as Record<string, unknown>
    const ob = b as Record<string, unknown>
    for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) comparar(oa[k], ob[k], path ? `${path}.${k}` : k, subject, out)
    return
  }
  out.push({ subject, kind: 'changed', path, before: a, after: b })
}

export function diffModels(viejo: Analysis, nuevo: Analysis): ModelDiff {
  const d: ModelDiff = { devices: {}, links: {}, linkKeyOld: {}, linkKeyNew: {}, changes: [], introduced: [], resolved: [], tests: [] }
  const va = new Map(viejo.model.devices.map((x) => [x.id, x]))
  const vb = new Map(nuevo.model.devices.map((x) => [x.id, x]))
  for (const id of new Set([...va.keys(), ...vb.keys()])) {
    const a = va.get(id)
    const b = vb.get(id)
    if (!a) { d.devices[id] = 'added'; d.changes.push({ subject: id, kind: 'added', path: '', after: b!.type }); continue }
    if (!b) { d.devices[id] = 'removed'; d.changes.push({ subject: id, kind: 'removed', path: '', before: a.type }); continue }
    const antes = d.changes.length
    comparar(a, b, '', id, d.changes)
    if (d.changes.length > antes) d.devices[id] = 'changed'
  }
  const la = new Map(viejo.links.map((l) => [linkKey(l), l]))
  const lb = new Map(nuevo.links.map((l) => [linkKey(l), l]))
  for (const l of viejo.links) d.linkKeyOld[l.id] = linkKey(l)
  for (const l of nuevo.links) d.linkKeyNew[l.id] = linkKey(l)
  for (const k of new Set([...la.keys(), ...lb.keys()])) {
    const a = la.get(k)
    const b = lb.get(k)
    if (!a) { d.links[k] = 'added'; d.changes.push({ subject: `link ${k}`, kind: 'added', path: '' }); continue }
    if (!b) { d.links[k] = 'removed'; d.changes.push({ subject: `link ${k}`, kind: 'removed', path: '' }); continue }
    const antes = d.changes.length
    const { a: _a1, b: _b1, id: _i1, ...ra } = a.link
    const { a: _a2, b: _b2, id: _i2, ...rb } = b.link
    comparar(ra, rb, '', `link ${k}`, d.changes)
    if (d.changes.length > antes) d.links[k] = 'changed'
  }
  for (const k of ['vlans', 'zones', 'tests', 'meta'] as const) comparar(viejo.model[k], nuevo.model[k], k, k === 'meta' ? 'meta' : k, d.changes)
  const firma = (x: Diagnostic): string => `${x.code}|${x.message}`
  const da = new Set(viejo.diagnostics.filter((x) => x.severity !== 'info').map(firma))
  const db = new Set(nuevo.diagnostics.filter((x) => x.severity !== 'info').map(firma))
  d.introduced = nuevo.diagnostics.filter((x) => x.severity !== 'info' && !da.has(firma(x)))
  d.resolved = viejo.diagnostics.filter((x) => x.severity !== 'info' && !db.has(firma(x)))
  const ta = new Map(viejo.tests.map((t) => [`${t.from} → ${t.to}`, t.passed === true ? 'OK' : t.passed === false ? 'FAIL' : '?']))
  const tb = new Map(nuevo.tests.map((t) => [`${t.from} → ${t.to}`, t.passed === true ? 'OK' : t.passed === false ? 'FAIL' : '?']))
  for (const k of new Set([...ta.keys(), ...tb.keys()])) {
    if (ta.get(k) !== tb.get(k)) d.tests.push({ test: k, before: ta.get(k) ?? null, after: tb.get(k) ?? null })
  }
  return d
}

function v(x: unknown): string {
  if (x === undefined) return '—'
  const t = typeof x === 'string' ? x : JSON.stringify(x)
  return t.length > 90 ? `${t.slice(0, 87)}…` : t
}

export function diffMarkdown(d: ModelDiff, nombreA: string, nombreB: string): string {
  const L: string[] = [`# Changes: ${nombreA} → ${nombreB}`, '']
  const cuenta = (s: DiffState): number => Object.values(d.devices).filter((x) => x === s).length
  const cuentaL = (s: DiffState): number => Object.values(d.links).filter((x) => x === s).length
  L.push(`- Devices: **+${cuenta('added')}** / **−${cuenta('removed')}** / **~${cuenta('changed')}**`)
  L.push(`- Links: **+${cuentaL('added')}** / **−${cuentaL('removed')}** / **~${cuentaL('changed')}**`)
  L.push(`- Diagnostics: **${d.introduced.filter((x) => x.severity === 'error').length} new errors**, ${d.resolved.filter((x) => x.severity === 'error').length} resolved errors`, '')
  if (d.changes.length) {
    L.push('## Details', '', '| Subject | Change | Field | Before | After |', '|---|---|---|---|---|')
    for (const c of d.changes) L.push(`| ${c.subject} | ${{ added: 'added', removed: 'removed', changed: 'modified' }[c.kind]} | ${c.path || '—'} | ${v(c.before).replace(/\|/g, '\\|')} | ${v(c.after).replace(/\|/g, '\\|')} |`)
    L.push('')
  } else L.push('_No changes in the model._', '')
  if (d.introduced.length) { L.push('## New issues', ''); for (const x of d.introduced) L.push(`- **${x.severity.toUpperCase()}** \`${x.code}\` — ${x.message}`); L.push('') }
  if (d.resolved.length) { L.push('## Resolved issues', ''); for (const x of d.resolved) L.push(`- \`${x.code}\` — ${x.message}`); L.push('') }
  if (d.tests.length) { L.push('## Tests with a changed result', '', '| Test | Before | After |', '|---|---|---|'); for (const t of d.tests) L.push(`| ${t.test} | ${t.before ?? '—'} | ${t.after ?? '—'} |`); L.push('') }
  return L.join('\n')
}
