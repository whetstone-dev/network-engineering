// Validador mínimo de JSON Schema (subconjunto draft-07) sin dependencias.
// Usa schemas/network-model.schema.json para detectar campos desconocidos (errores de tipeo),
// tipos y valores fuera de rango. El mismo schema da autocompletado en VS Code.

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
      throw new Error(`No se pudo leer el schema ${SCHEMA_PATH}: ${(e as Error).message}`)
    }
  }
  return cache
}

function resolver(s: Schema): Schema {
  const ref = s.$ref as string | undefined
  if (!ref) return s
  const nombre = ref.replace('#/definitions/', '')
  const def = (raiz().definitions as Record<string, Schema>)[nombre]
  if (!def) throw new Error(`Referencia de schema desconocida: ${ref}`)
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
    if (!ok) out.push({ path, message: 'no coincide con ninguna de las formas permitidas', kind: 'type' })
    return
  }
  if ('const' in s && v !== s.const) { out.push({ path, message: `debe ser ${JSON.stringify(s.const)}`, kind: 'value' }); return }
  if (s.enum && !(s.enum as unknown[]).includes(v)) { out.push({ path, message: `valor ${JSON.stringify(v)} no permitido (use: ${(s.enum as unknown[]).join(', ')})`, kind: 'value' }); return }
  if (s.type && !cumpleTipo(v, s.type as string | string[])) { out.push({ path, message: `se esperaba ${Array.isArray(s.type) ? s.type.join(' o ') : s.type}, llegó ${tipoDe(v)}`, kind: 'type' }); return }
  if (typeof v === 'number') {
    if (typeof s.minimum === 'number' && v < s.minimum) out.push({ path, message: `mínimo ${s.minimum}`, kind: 'value' })
    if (typeof s.maximum === 'number' && v > s.maximum) out.push({ path, message: `máximo ${s.maximum}`, kind: 'value' })
    if (typeof s.multipleOf === 'number' && v % s.multipleOf !== 0) out.push({ path, message: `debe ser múltiplo de ${s.multipleOf}`, kind: 'value' })
  }
  if (typeof v === 'string' && typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v)) {
    out.push({ path, message: `formato inválido "${v}"${s.description ? ` (${s.description})` : ''}`, kind: 'value' })
  }
  if (Array.isArray(v) && s.items) v.forEach((x, n) => validateAgainst(x, s.items as Schema, `${path}[${n}]`, out))
  if (tipoDe(v) === 'object') {
    const obj = v as Record<string, unknown>
    const props = (s.properties ?? {}) as Record<string, Schema>
    for (const r of (s.required ?? []) as string[]) if (!(r in obj)) out.push({ path, message: `falta el campo obligatorio "${r}"`, kind: 'required' })
    for (const [k, val] of Object.entries(obj)) {
      if (val === undefined) continue          // igual que JSON: una clave con undefined no existe
      if (props[k]) validateAgainst(val, props[k], `${path}.${k}`, out)
      else if (s.additionalProperties === false) out.push({ path: `${path}.${k}`, message: `campo desconocido "${k}"${sugerencia(k, Object.keys(props))}`, kind: 'unknown-field' })
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') validateAgainst(val, s.additionalProperties as Schema, `${path}.${k}`, out)
    }
  }
}

/** Sugiere el campo válido más parecido (distancia de edición ≤ 2). */
function sugerencia(k: string, validos: string[]): string {
  const dist = (a: string, b: string): number => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 1; j <= b.length; j++) m[0][j] = j
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1))
    return m[a.length][b.length]
  }
  const mejor = validos.map((v) => [v, dist(k, v)] as const).sort((x, y) => x[1] - y[1])[0]
  return mejor && mejor[1] <= 2 ? ` (¿quiso decir "${mejor[0]}"?)` : ''
}

/** Valida el modelo completo contra el schema y agrega diagnósticos legibles. */
export function checkSchema(model: unknown, diags: Diagnostic[]): void {
  const issues: SchemaIssue[] = []
  validateAgainst(model, raiz(), '$', issues)
  const modelo = model as { devices?: { id?: string }[] }
  for (const i of issues.slice(0, 50)) {
    // ruta legible: $.devices[2].interfaces[0].ip → SW1.interfaces[0].ip
    const m = i.path.match(/^\$\.devices\[(\d+)\](.*)$/)
    const legible = m && modelo.devices?.[Number(m[1])]?.id ? `${modelo.devices[Number(m[1])].id}${m[2]}` : i.path.replace(/^\$\.?/, '') || '(raíz)'
    diags.push({
      severity: i.kind === 'unknown-field' ? 'warning' : 'error',
      code: i.kind === 'unknown-field' ? 'SCHEMA-UNKNOWN-FIELD' : 'SCHEMA-INVALID',
      message: `${legible}: ${i.message}.`,
      subject: m && modelo.devices?.[Number(m[1])]?.id ? { device: modelo.devices[Number(m[1])].id } : undefined,
      hint: i.kind === 'unknown-field' ? 'Los campos desconocidos se ignoran: revise el nombre en references/model.md.' : undefined,
    })
  }
  if (issues.length > 50) diags.push({ severity: 'warning', code: 'SCHEMA-MANY', message: `Hay ${issues.length - 50} problemas de schema adicionales no listados.` })
}
