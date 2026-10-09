// Execute the Socket attack fixtures in an isolated headless browser profile.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { analyze } from '../lib/validate.ts'
import { buildViewerData, renderHtml } from '../lib/render.ts'
import type { NetworkModel } from '../lib/model.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const browser = process.argv[2] ?? process.env.NETLAB_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
if (!browser || !existsSync(browser)) throw new Error('Supply an installed Chrome/Edge/Chromium executable or set NETLAB_BROWSER.')
const base = resolve(tmpdir()); const temp = mkdtempSync(join(base, 'netlab-viewer-browser-'))
const evidence = join(root, 'docs/reviews/hardening-comparison')
const model = JSON.parse(readFileSync(join(root, 'examples/pt-3vlan-roas-dhcp.net.json'), 'utf8')) as NetworkModel
const analysis = analyze(model)
const versions = [['vulnerable', 'cff5cb1'], ['baseline', '5a05aab'], ['working', undefined]] as const
const results: Record<string, unknown>[] = []
try {
  for (const [label, commit] of versions) {
    const data = buildViewerData(analysis) as any
    const payload = '<img src=x onerror="globalThis.__xss=true">'
    const severity = 'error"><img src=x onerror="globalThis.__xss=true"><span class="'
    const node = data.l3.nodes.find((n: any) => n.kind === 'subnet')
    node.gateways = [payload, 'R1 192.0.2.1']
    const issue = { severity, message: '<svg onload="globalThis.__xss=true">', code: 'XSS-FIXTURE', hint: payload }
    data.diagnostics = [issue]; data.counts = { error: 1, warning: 0, info: 0 }
    data.diff = { oldName: payload, introduced: [issue], resolved: [], changes: [], tests: [] }
    let viewer = readFileSync(join(root, 'assets/viewer.js'), 'utf8')
    if (commit) {
      const r = spawnSync('git', ['-C', root, 'show', `${commit}:assets/viewer.js`], { encoding: 'utf8', timeout: 10000 })
      if (r.status !== 0) throw new Error(r.stderr)
      viewer = r.stdout
    }
    viewer = viewer.replace('  // ---------- startup ----------', '  window.__viewerTest = { state: state, renderInspector: renderInspector };\n  // ---------- startup ----------')
    let html = renderHtml(analysis)
    html = html.replace(/(<script id="net-data" type="application\/json">)[\s\S]*?(<\/script>)/, (_m, a, b) => a + JSON.stringify(data).replace(/</g, '\\u003c') + b)
    html = html.replace(/<script>\s*\/\/ Network topology viewer[\s\S]*?<\/script>/, () => '<script>' + viewer + '</script>')
    html = html.replace('<head>', '<head><script>window.__xss=false;window.__viewerErrors=[];window.addEventListener("error",function(e){if(e.message)window.__viewerErrors.push(e.message)});</script>')
    const driver = `
      window.__viewerTest.state.sel={kind:'subnet',id:${JSON.stringify(node.id)}};
      window.__viewerTest.renderInspector();
      setTimeout(function(){
        var pane=document.getElementById('pane-inspector');
        var classes=Array.from(document.querySelectorAll('.sev')).map(function(e){return e.className});
        var result={xssExecuted:window.__xss,gatewayTextPreserved:pane.textContent.includes(${JSON.stringify(payload)}),injectedElements:pane.querySelectorAll('img,script,svg').length,injectedAttributes:document.querySelectorAll('[onerror],[onclick],[onload]').length,severityClassesKnown:classes.every(function(c){return /^sev (error|warning|info)$/.test(c)}),errors:window.__viewerErrors};
        var output=document.createElement('pre');output.id='browser-result';output.textContent=JSON.stringify(result);document.body.appendChild(output);
      },500);`
    html = html.replace('</body>', '<script>' + driver + '</script></body>')
    const path = join(temp, `${label}.html`); writeFileSync(path, html)
    const r = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(temp, label + '-profile')}`, '--allow-file-access-from-files', '--dump-dom', '--virtual-time-budget=2000', pathToFileURL(path).href], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000, windowsHide: true })
    if (r.error || r.status !== 0) throw r.error ?? new Error(r.stderr)
    const captured = r.stdout.match(/<pre id="browser-result">([\s\S]*?)<\/pre>/)?.[1]
    if (!captured) throw new Error(`No browser result for ${label}: ${r.stderr.slice(-1000)}`)
    results.push({ label, commit: commit ?? 'uncommitted', ...JSON.parse(captured.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) })
  }
  mkdirSync(evidence, { recursive: true })
  const report = { browser, runAt: new Date().toISOString(), results }
  writeFileSync(join(evidence, 'viewer-browser.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  const last = results[2]
  if (!results[0].xssExecuted || last.xssExecuted || !last.gatewayTextPreserved || last.injectedElements !== 0 || last.injectedAttributes !== 0 || !last.severityClassesKnown || (last.errors as unknown[]).length) process.exitCode = 1
} finally {
  const rel = relative(base, resolve(temp))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Refusing cleanup outside the temporary directory')
  rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
