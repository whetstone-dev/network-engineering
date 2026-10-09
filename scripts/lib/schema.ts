// Minimal dependency-free JSON Schema validator (draft-07 subset).
// Uses schemas/network-model.schema.json to detect unknown fields (typos),
// wrong types and out-of-range values. The same schema provides autocompletion in VS Code.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Diagnostic } from './model.ts'

type Schema = Record<string, unknown>

export const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'network-model.schema.json')

let cache: Schema | undefined
function raiz(): Schema {
  if (!cache) {
    try {
      cache = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Schema
    } catch (e) {
      throw new Error(`Could not read schema ${SCHEMA_PATH}: ${(e as Error).message}`)
    }
  }
  return cache
}

function resolver(s: Schema): Schema {
  const ref = s.$ref as string | undefined
  if (!ref) return s
  const nombre = ref.replace('#/definitions/', '')
  const def = (raiz().definitions as Record<string, Schema>)[nombre]
  if (!def) throw new Error(`Unknown schema reference: ${ref}`)
  return resolver(def)
}

function tipoDe(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

function cumpleTipo(v: unknown, t: string | string[]): boolean {
  const tipos = Array.isArray(t) ? t : [t]
  const real = tipoDe(v)
  return tipos.some((x) => x === real || (x === 'number' && real === 'integer'))
}

export interface SchemaIssue { path: string; message: string; kind: 'unknown-field' | 'type' | 'value' | 'required' }

export function validateAgainst(v: unknown, s0: Schema, path: string, out: SchemaIssue[]): void {
  const s = resolver(s0)
  if (s.anyOf) {
    const ok = (s.anyOf as Schema[]).some((alt) => { const tmp: SchemaIssue[] = []; validateAgainst(v, alt, path, tmp); return tmp.length === 0 })
    if (!ok) out.push({ path, message: 'does not match any of the allowed forms', kind: 'type' })
    return
  }
  if ('const' in s && v !== s.const) { out.push({ path, message: `must be ${JSON.stringify(s.const)}`, kind: 'value' }); return }
  if (s.enum && !(s.enum as unknown[]).includes(v)) { out.push({ path, message: `value ${JSON.stringify(v)} not allowed (use: ${(s.enum as unknown[]).join(', ')})`, kind: 'value' }); return }
  if (s.type && !cumpleTipo(v, s.type as string | string[])) { out.push({ path, message: `expected ${Array.isArray(s.type) ? s.type.join(' or ') : s.type}, got ${tipoDe(v)}`, kind: 'type' }); return }
  if (typeof v === 'number') {
    if (typeof s.minimum === 'number' && v < s.minimum) out.push({ path, message: `minimum ${s.minimum}`, kind: 'value' })
    if (typeof s.maximum === 'number' && v > s.maximum) out.push({ path, message: `maximum ${s.maximum}`, kind: 'value' })
    if (typeof s.multipleOf === 'number' && v % s.multipleOf !== 0) out.push({ path, message: `must be a multiple of ${s.multipleOf}`, kind: 'value' })
  }
  if (typeof v === 'string' && typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v)) {
    out.push({ path, message: `invalid format "${v}"${s.description ? ` (${s.description})` : ''}`, kind: 'value' })
  }
  if (Array.isArray(v) && s.items) v.forEach((x, n) => validateAgainst(x, s.items as Schema, `${path}[${n}]`, out))
  if (tipoDe(v) === 'object') {
    const obj = v as Record<string, unknown>
    const props = (s.properties ?? {}) as Record<string, Schema>
    for (const r of (s.required ?? []) as string[]) if (!Object.hasOwn(obj, r) || obj[r] === undefined) out.push({ path, message: `missing required field "${r}"`, kind: 'required' })
    for (const [k, val] of Object.entries(obj)) {
      if (val === undefined) continue          // same as JSON: a key with undefined does not exist
      if (Object.hasOwn(props, k)) validateAgainst(val, props[k], `${path}.${k}`, out)
      else if (s.additionalProperties === false) out.push({ path: `${path}.${k}`, message: `unknown field "${k}"${sugerencia(k, Object.keys(props))}`, kind: 'unknown-field' })
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') validateAgainst(val, s.additionalProperties as Schema, `${path}.${k}`, out)
    }
  }
}

/** Suggests the closest valid field (edit distance ≤ 2). */
function sugerencia(k: string, validos: string[]): string {
  const dist = (a: string, b: string): number => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 1; j <= b.length; j++) m[0][j] = j
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1))
    return m[a.length][b.length]
  }
  const mejor = validos.map((v) => [v, dist(k, v)] as const).sort((x, y) => x[1] - y[1])[0]
  return mejor && mejor[1] <= 2 ? ` (did you mean "${mejor[0]}"?)` : ''
}

/** Validates the whole model against the schema and adds readable diagnostics. */
export function checkSchema(model: unknown, diags: Diagnostic[], relaxed = false): boolean {
  const issues: SchemaIssue[] = []
  validateAgainst(model, raiz(), '$', issues)
  const modelo = model as { devices?: { id?: string }[] }
  for (const i of issues.slice(0, 50)) {
    // readable path: $.devices[2].interfaces[0].ip → SW1.interfaces[0].ip
    const m = i.path.match(/^\$\.devices\[(\d+)\](.*)$/)
    const legible = m && modelo.devices?.[Number(m[1])]?.id ? `${modelo.devices[Number(m[1])].id}${m[2]}` : i.path.replace(/^\$\.?/, '') || '(root)'
    diags.push({
      severity: relaxed && i.kind === 'unknown-field' ? 'warning' : 'error',
      code: i.kind === 'unknown-field' ? 'SCHEMA-UNKNOWN-FIELD' : 'SCHEMA-INVALID',
      message: `${legible}: ${i.message}.`,
      subject: m && modelo.devices?.[Number(m[1])]?.id ? { device: modelo.devices[Number(m[1])].id } : undefined,
      hint: i.kind === 'unknown-field' ? 'Unknown fields are ignored: check the name in references/model.md.' : undefined,
    })
  }
  if (issues.length > 50) {
    const omitted = issues.slice(50)
    const structural = omitted.some((i) => i.kind !== 'unknown-field')
    diags.push({ severity: structural || !relaxed ? 'error' : 'warning', code: structural ? 'SCHEMA-INVALID' : 'SCHEMA-MANY', message: `${omitted.length} additional schema issues not listed${structural ? ', including invalid structure or values' : ''}.` })
  }
  return !issues.some((i) => i.kind !== 'unknown-field')
}
