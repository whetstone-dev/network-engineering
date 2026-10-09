import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

// Execute the real viewer functions with DOM sinks recorded. Browser verification is
// separate; this dependency-free regression exercises the same functions in CI.
function viewer(data: Record<string, unknown>) {
  class Element {
    innerHTML = ''; textContent = ''; children: Element[] = []; attrs: Record<string, string> = {}
    className = ''; style = {}; value = ''; hidden = false
    classList = { toggle() {}, add() {}, remove() {} }
    appendChild(e: Element) { this.children.push(e); return e }
    setAttribute(k: string, v: string) { this.attrs[k] = v }
    getAttribute(k: string) { return this.attrs[k] ?? null }
    addEventListener() {}
    querySelectorAll() { return [] }
    querySelector(s: string) { return get(s) }
    getBoundingClientRect() { return { width: 1000, height: 800, x: 0, y: 0 } }
  }
  const nodes = new Map<string, Element>()
  function get(s: string): Element { if (!nodes.has(s)) nodes.set(s, new Element()); return nodes.get(s)! }
  get('net-data').textContent = JSON.stringify(data)
  const document = { getElementById: get, querySelector: get, querySelectorAll: () => [], createElement: () => new Element(), createElementNS: () => new Element(), documentElement: new Element(), addEventListener() {} }
  const sandbox: Record<string, any> = { document, window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} } }
  const code = readFileSync(join(ROOT, 'assets/viewer.js'), 'utf8').replace('  // ---------- startup ----------', '  globalThis.viewerTest = { state: state, renderInspector: renderInspector, renderDiags: renderDiags, renderDiff: renderDiff }; return;\n  // ---------- startup ----------')
  runInNewContext(code, sandbox, { timeout: 2000 })
  assert.ok(sandbox.viewerTest, 'viewer test hook must execute')
  return { api: sandbox.viewerTest, get }
}
function data() { return { meta: { name: 'Untrusted viewer' }, devices: [], links: [], vlans: [], zones: [], tests: [], diagnostics: [] as unknown[], counts: { error: 0, warning: 0, info: 0 }, tables: {}, l3: { nodes: [] as unknown[], edges: [] }, diff: undefined as unknown } }

test('Socket regression: subnet gateway payloads never become HTML elements', () => {
  const d = data(); const payload = '<img src=x onerror="globalThis.XSS=1">'
  d.l3.nodes.push({ id: 'net:1', label: '192.0.2.0/24', gateways: [payload, 'R1 192.0.2.1'], members: [], switches: [], vlans: [], hosts: 0 })
  const v = viewer(d); v.api.state.sel = { kind: 'subnet', id: 'net:1' }; v.api.renderInspector()
  const pane = v.get('#pane-inspector')
  assert.ok(!pane.innerHTML.includes('<img'), 'gateway must not enter an HTML sink unescaped')
  const text = (e: typeof pane): string => e.textContent + e.children.map(text).join(' ')
  assert.ok(pane.innerHTML.includes('&lt;img') || text(pane).includes(payload), 'malicious value should remain visible as text')
})

test('Socket regression: severity values cannot create attributes in diagnostics or diff', () => {
  const d = data(); const severity = 'error" onclick="globalThis.XSS=1'
  const issue = { severity, message: '<svg onload="globalThis.XSS=1">', code: 'XSS', hint: '<img src=x>' }
  d.diagnostics.push(issue)
  d.diff = { oldName: 'Before', introduced: [issue], resolved: [], changes: [], tests: [] }
  const v = viewer(d); v.api.renderDiags(); v.api.renderDiff()
  for (const p of ['#pane-diags', '#pane-diff']) {
    const html = v.get(p).innerHTML
    assert.doesNotMatch(html, /<svg\b|<img\b|class="sev error" onclick=/)
    assert.ok(html.includes('&lt;svg'))
  }
})

test('Viewer boundary: diagnostic severity CSS classes use only fixed known tokens', () => {
  const d = data(); const issue = { severity: 'error injected-class', message: 'Message', code: 'CUSTOM' }
  d.diagnostics.push(issue); d.diff = { oldName: 'Before', introduced: [issue], resolved: [], changes: [], tests: [] }
  const v = viewer(d); v.api.renderDiags(); v.api.renderDiff()
  for (const p of ['#pane-diags', '#pane-diff']) for (const match of v.get(p).innerHTML.matchAll(/class="sev ([^"]*)"/g)) assert.ok(['error', 'warning', 'info'].includes(match[1]), match[1])
})
