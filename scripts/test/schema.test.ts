import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SCHEMA_PATH, validateAgainst } from '../lib/schema.ts'
import type { SchemaIssue } from '../lib/schema.ts'
import type { NetworkModel } from '../lib/model.ts'
import { analyze } from '../lib/validate.ts'

function issues(value: unknown, schema: Record<string, unknown>): SchemaIssue[] {
  const out: SchemaIssue[] = []; validateAgainst(value, schema, '$', out); return out
}

test('Schema subset: every constraint used by the model accepts valid and rejects invalid values', () => {
  const cases: [Record<string, unknown>, unknown, unknown][] = [
    [{ type: 'integer' }, 2, 2.5], [{ type: 'number' }, 2, '2'], [{ type: ['string', 'null'] }, null, false],
    [{ const: 1 }, 1, 2], [{ enum: ['up', 'down'] }, 'up', 'UP'],
    [{ type: 'number', minimum: 1, maximum: 10 }, 1, 0], [{ type: 'number', maximum: 10 }, 10, 11],
    [{ multipleOf: 4096 }, 8192, 4097], [{ pattern: '^[A-Z]+$' }, 'ABC', 'ABC1'],
    [{ type: 'array', items: { type: 'integer' } }, [1, 2], [1, '2']],
    [{ type: 'object', required: ['a'], properties: { a: { type: 'integer' } }, additionalProperties: false }, { a: 2 }, { a: 2, typo: 3 }],
    [{ type: 'object', required: ['a'] }, { a: 1 }, {}],
    [{ additionalProperties: { type: 'integer' } }, { R1: 1 }, { R1: '1' }],
    [{ anyOf: [{ type: 'integer' }, { const: 'all' }] }, 'all', 'none'],
    [{ $ref: '#/definitions/vlanId' }, 10, 4095],
  ]
  for (const [schema, good, bad] of cases) {
    assert.equal(issues(good, schema).length, 0, JSON.stringify(schema))
    assert.ok(issues(bad, schema).length > 0, JSON.stringify(schema))
  }
  assert.ok(issues({ a: undefined }, { required: ['a'] }).length > 0)
  assert.ok(issues(JSON.parse('{"constructor": 1}'), { properties: {}, additionalProperties: false }).some((i) => i.kind === 'unknown-field'))
})

test('Schema subset: new unimplemented constraints cannot silently enter the schema', () => {
  const supported = new Set(['$schema', '$id', '$ref', 'title', 'description', 'default', 'definitions', 'type', 'required', 'additionalProperties', 'properties', 'const', 'items', 'pattern', 'enum', 'minimum', 'maximum', 'anyOf', 'multipleOf'])
  function check(schema: Record<string, unknown>): void {
    for (const [key, val] of Object.entries(schema)) {
      assert.ok(supported.has(key), `Unsupported JSON Schema keyword: ${key}`)
      if (key === 'properties' || key === 'definitions') for (const s of Object.values(val as Record<string, Record<string, unknown>>)) check(s)
      else if (key === 'anyOf') for (const s of val as Record<string, unknown>[]) check(s)
      else if ((key === 'items' || key === 'additionalProperties') && typeof val === 'object') check(val as Record<string, unknown>)
    }
  }
  check(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')))
})

test('Schema: structural errors beyond the display limit stop semantic analysis', () => {
  const m = { modelVersion: 1, meta: { name: 'Bad' }, ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`typo${i}`, true])), devices: [{ id: 'R1', type: 'router', interfaces: [], routing: { ospf: { networks: 12 } } }], links: [] }
  const a = analyze(m as unknown as NetworkModel)
  assert.ok(a.counts.error > 0)
  assert.equal(a.devices.size, 0)
  const relaxed = analyze(m as unknown as NetworkModel, { relaxed: true })
  assert.ok(relaxed.counts.error > 0, 'omitted structural errors must still fail relaxed validation')
})
