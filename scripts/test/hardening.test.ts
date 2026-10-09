import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import type { NetworkModel } from '../lib/model.ts'
import { analyze } from '../lib/validate.ts'
import { generateAll, generateConfig } from '../lib/ios.ts'
import { buildDocs } from '../lib/docs.ts'
import { buildViewerData, renderHtml } from '../lib/render.ts'
import { importConfigs } from '../lib/importer.ts'
import { diffModels } from '../lib/diff.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CLI = join(ROOT, 'scripts/netlab.ts')
const load = (name = 'pt-3vlan-roas-dhcp'): NetworkModel => JSON.parse(readFileSync(join(ROOT, 'examples', `${name}.net.json`), 'utf8'))
function cli(...args: string[]) { return spawnSync(process.execPath, [CLI, ...args], { cwd: args[1]?.endsWith('.json') ? dirname(resolve(args[1])) : ROOT, encoding: 'utf8', timeout: 30000 }) }
function workspace(run: (dir: string) => void): void {
  const base = resolve(tmpdir())
  const dir = mkdtempSync(join(base, 'netlab-hardening-'))
  try { run(dir) } finally {
    const rel = relative(base, resolve(dir))
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'cleanup must stay inside the temporary directory')
    rmSync(dir, { recursive: true, force: true })
  }
}
function save(dir: string, m: unknown): string { const p = join(dir, 'network.net.json'); writeFileSync(p, JSON.stringify(m)); return p }

test('Platforms: unsupported explicit profiles never receive IOS or ASA commands', () => workspace((dir) => {
  for (const [type, platform] of [['l3switch', 'nxos'], ['router', 'other'], ['switch', 'endpoint'], ['router', 'asa'], ['firewall', 'other'], ['firewall', 'ios']] as const) {
    const m: NetworkModel = { modelVersion: 1, meta: { name: 'Unsupported' }, devices: [{ id: 'D1', type, platform, interfaces: [] }], links: [] }
    assert.ok(analyze(m).diagnostics.some((d) => d.code === 'PLATFORM-UNSUPPORTED' && d.severity === 'error'), `${type}/${platform}`)
    const c = generateConfig(m, m.devices[0])
    assert.equal(c.kind, 'unsupported')
    assert.doesNotMatch(c.text, /^configure terminal|^hostname /m)
    const out = join(dir, `${type}-${platform}`)
    assert.notEqual(cli('config', save(dir, m), '-o', out).status, 0)
    assert.equal(existsSync(out), false)
    assert.doesNotThrow(() => renderHtml(analyze(m)))
  }
}))

test('CLI: invalid build and config fail before writing any output', () => workspace((dir) => {
  const path = save(dir, load('troubleshooting-broken-lab'))
  for (const cmd of ['build', 'config']) {
    const out = join(dir, cmd)
    const r = cli(cmd, path, '-o', out)
    assert.notEqual(r.status, 0, `${cmd} must fail`)
    assert.equal(existsSync(out), false, `${cmd} must not create output`)
  }
}))

test('CLI: diagnostic build returns nonzero and writes reports without configs', () => workspace((dir) => {
  const out = join(dir, 'diagnostics')
  const r = cli('build', save(dir, load('troubleshooting-broken-lab')), '--allow-invalid', '-o', out)
  assert.notEqual(r.status, 0)
  assert.ok(existsSync(join(out, 'topology.html')))
  assert.ok(existsSync(join(out, 'analysis.json')))
  assert.equal(existsSync(join(out, 'configs')), false)
}))

test('CLI: unknown flags, missing flag values, and config escape hatches fail', () => workspace((dir) => {
  const p = save(dir, load())
  for (const args of [['validate', p, '--strcit'], ['config', p, '--device'], ['build', p, '-o'], ['config', p, '--allow-invalid'], ['build', p, '--include-secrets', '--allow-invalid']]) {
    const r = cli(...args)
    assert.notEqual(r.status, 0, args.join(' '))
    assert.match(r.stderr, /option|flag|value|invalid/i)
  }
}))

test('CLI: strict validation rejects warnings with a machine-readable quality gate', () => workspace((dir) => {
  const m: NetworkModel = { modelVersion: 1, meta: { name: 'Warning' }, devices: [{ id: 'PC1', type: 'pc', interfaces: [] }], links: [] }
  const p = save(dir, m)
  assert.equal(cli('validate', p).status, 0)
  const r = cli('validate', p, '--strict', '--json')
  assert.notEqual(r.status, 0)
  assert.equal(JSON.parse(r.stdout).qualityGate.status, 'fail')
  for (const cmd of ['build', 'config']) {
    const out = join(dir, cmd)
    assert.notEqual(cli(cmd, p, '--strict', '-o', out).status, 0)
    assert.equal(existsSync(out), false)
  }
}))

test('CLI: required inconclusive tests block validation and generation', () => workspace((dir) => {
  const m: NetworkModel = { modelVersion: 1, meta: { name: 'Unknown' }, devices: [{ id: 'R1', type: 'router', interfaces: [{ name: 'Gi0/0', ip: '192.0.2.1/24' }] }], links: [], tests: [{ from: 'R1', to: '192.0.2.99' }] }
  const p = save(dir, m)
  const r = cli('validate', p, '--json')
  assert.notEqual(r.status, 0)
  const a = JSON.parse(r.stdout)
  assert.equal(a.tests[0].passed, null)
  assert.equal(a.qualityGate.status, 'inconclusive')
  for (const cmd of ['build', 'config']) assert.notEqual(cli(cmd, p).status, 0)
}))

test('Schema: typos fail by default and relaxed discovery cannot generate', () => workspace((dir) => {
  const m = load() as NetworkModel & { typo?: boolean }
  m.typo = true
  assert.equal(analyze(m).diagnostics.find((d) => d.code === 'SCHEMA-UNKNOWN-FIELD')?.severity, 'error')
  const p = save(dir, m)
  assert.notEqual(cli('validate', p).status, 0)
  assert.equal(cli('validate', p, '--relaxed').status, 0)
  assert.notEqual(cli('config', p, '--relaxed').status, 0)
}))

test('Schema: malformed models produce diagnostics without mutation or exceptions', () => {
  for (const m of [null, [], {}, { modelVersion: 1, meta: { name: 'Bad' }, devices: [null], links: [] }, { modelVersion: 1, meta: { name: 'Bad' }, devices: [{ id: 'R1', type: 'router' }], links: [] }, { ...load(), tests: 12 }, { ...load(), devices: [{ id: 'R1', type: 'router', interfaces: [{ name: 5 }] }] }]) {
    const before = JSON.stringify(m)
    assert.ok(analyze(m as NetworkModel).counts.error > 0)
    assert.equal(JSON.stringify(m), before)
  }
})

test('Input safety: unsafe IDs and case-insensitive file collisions fail', () => {
  for (const id of ['../outside', '..\\outside', 'R1/evil', 'C:drive', 'CON', 'LPT1', 'constructor', '__proto__', 'R1\nend']) {
    const m = load(); m.devices[0].id = id
    assert.ok(analyze(m).counts.error > 0, id)
    assert.throws(() => generateConfig(m, m.devices[0]), /id|identifier|control|hostname/i)
  }
  const m = load(); m.devices.push({ id: m.devices[0].id.toLowerCase(), type: 'router', interfaces: [] })
  assert.ok(analyze(m).diagnostics.some((d) => d.code === 'DEVICE-ID-COLLISION'))
})

test('Input safety: multiline CLI values cannot produce executable commands', () => {
  for (const mutate of [
    (m: NetworkModel) => { m.meta.name = 'Network\nreload' },
    (m: NetworkModel) => { m.devices[0].security = { enableSecret: 'safe\nend\nreload' } },
    (m: NetworkModel) => { m.devices[0].services = { snmp: { community: 'public\rreload', mode: 'ro' } } },
    (m: NetworkModel) => { m.devices[0].interfaces[0].name = 'Gi0/0\nend' },
  ]) {
    const m = load(); mutate(m)
    assert.ok(analyze(m).diagnostics.some((d) => d.code === 'CLI-CONTROL-CHAR'))
    assert.throws(() => generateConfig(m, m.devices[0]), /control/i)
  }
})

test('Import: unsupported authentication lines and encoded keys retain no values', () => {
  const secrets = ['RADIUS-CANARY', 'KEYCHAIN-CANARY', 'BGP-CANARY', 'OPAQUE-CANARY']
  const { model, report } = importConfigs([{ name: 'secrets.cfg', text: `hostname R1\nradius server AUTH\n key 7 ${secrets[0]}\nkey chain CHAIN\n key 1\n  key-string ${secrets[1]}\nrouter bgp 65001\n neighbor 192.0.2.1 password 7 ${secrets[2]}\ncustom-auth opaque ${secrets[3]}\nend\n` }])
  const retained = JSON.stringify({ model, report })
  for (const s of secrets) assert.ok(!retained.includes(s), s)
  assert.ok(model.devices[0].extraConfig?.length)
  assert.match(retained, /quarantin/i)
})

test('Generators: extraConfig is quarantined and persistence is always separate', () => {
  for (const name of ['pt-3vlan-roas-dhcp', 'asa-dmz']) {
    const m = load(name)
    const d = m.devices.find((d) => d.type === 'router' || d.type === 'firewall')!
    d.extraConfig = ['reload', 'username injected secret EXTRA-CANARY']
    const text = generateConfig(m, d).text
    assert.ok(!text.includes('EXTRA-CANARY'))
    assert.doesNotMatch(text, /^\s*(?:write memory|reload|copy running-config startup-config)\s*$/m)
  }
})

test('Artifacts: known secrets never appear in HTML, docs, or diff previews', () => {
  const m = load('vpn-ipsec-ospfv3')
  const d = m.devices.find((d) => d.vpn?.siteToSite.length)!
  d.security = { enableSecret: 'ENABLE-CANARY', consolePassword: 'CONSOLE-CANARY', vtyPassword: 'VTY-CANARY', ssh: { domain: 'example.test', username: 'admin', password: 'SSH-CANARY', modulus: 2048 } }
  d.services = { ...d.services, snmp: { community: 'SNMP-CANARY', mode: 'ro' } }
  for (const dev of m.devices) for (const t of dev.vpn?.siteToSite ?? []) t.psk = 'VPN-CANARY'
  const old = structuredClone(m); old.devices.find((dev) => dev.id === d.id)!.security!.enableSecret = 'OLD-CANARY'
  const a = analyze(m); const b = analyze(old)
  const diff = diffModels(b, a)
  for (const output of [JSON.stringify(buildViewerData(a)), renderHtml(a), renderHtml(a, { diff, old: b }), buildDocs(a, generateAll(m))]) {
    for (const s of ['ENABLE-CANARY', 'CONSOLE-CANARY', 'VTY-CANARY', 'SSH-CANARY', 'SNMP-CANARY', 'VPN-CANARY', 'OLD-CANARY']) assert.ok(!output.includes(s), s)
    assert.ok(output.includes('SECRET'))
  }
})

test('CLI: explicit secrets stay in config files and never in shareable build artifacts', () => workspace((dir) => {
  const m = load(); m.devices[0].security = { enableSecret: 'BUILD-CANARY' }
  const p = save(dir, m)
  const preview = cli('config', p)
  assert.equal(preview.status, 0, preview.stderr)
  assert.ok(!preview.stdout.includes('BUILD-CANARY'))
  const out = join(dir, 'restricted')
  const r = cli('build', p, '--include-secrets', '-o', out)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(readFileSync(join(out, 'configs', `${m.devices[0].id}.txt`), 'utf8').includes('BUILD-CANARY'))
  for (const f of ['topology.html', 'README.md', 'analysis.json', 'topology.mmd']) assert.ok(!readFileSync(join(out, f), 'utf8').includes('BUILD-CANARY'), f)
}))

test('HTML: adversarial text cannot terminate the JSON script or inject the title', () => {
  const m = load()
  const payload = '</script><script>alert("XSS")</script>'
  m.meta.description = payload
  m.devices[0].label = payload
  const html = renderHtml(analyze(m))
  assert.ok(!html.includes(payload))
  const json = html.match(/<script id="net-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
  const data = JSON.parse(json)
  assert.equal(data.meta.description, payload)
  assert.equal(data.devices[0].label, payload)
})

test('CLI: output path traversal is refused before file creation', () => workspace((dir) => {
  const m = load(); m.devices[0].id = '../escaped'
  const out = join(dir, 'configs')
  const r = cli('config', save(dir, m), '-o', out)
  assert.notEqual(r.status, 0)
  assert.equal(existsSync(join(dir, 'escaped.txt')), false)
  assert.equal(existsSync(out), false)
}))

test('CLI: existing output junctions/symlinks cannot redirect generated files', () => workspace((dir) => {
  const outside = join(dir, 'outside'); const out = join(dir, 'build')
  mkdirSync(outside); mkdirSync(out)
  symlinkSync(outside, join(out, 'configs'), process.platform === 'win32' ? 'junction' : 'dir')
  const r = cli('build', save(dir, load()), '-o', out)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /symbolic link/i)
  assert.deepEqual(readdirSync(outside), [])
  assert.equal(existsSync(join(out, 'topology.html')), false, 'preflight all paths before writing')
}))

test('Identifiers: separate hostname preserves the internal ID and filename', () => {
  const m = load(); const d = m.devices[0]
  d.id = 'asset_001'; d.hostname = 'edge-router'
  const config = generateConfig(m, d)
  assert.equal(config.device, 'asset_001')
  assert.match(config.text, /^hostname edge-router$/m)
  d.hostname = 'bad\nreload'
  assert.throws(() => generateConfig(m, d), /control|hostname/i)
})

test('CLI: malformed model JSON reports errors in JSON without leaking values', () => workspace((dir) => {
  for (const model of [null, { devices: 1 }, { ...load(), devices: [{ id: 'R1', type: 'router', interfaces: [], vpn: { siteToSite: 1 } }] }]) {
    const r = cli('validate', save(dir, model), '--json')
    assert.notEqual(r.status, 0)
    assert.ok(JSON.parse(r.stdout).counts.error > 0, r.stderr)
  }
}))

test('Redaction: a password equal to an ID or CLI keyword cannot rewrite the network', () => {
  for (const type of ['router', 'firewall'] as const) {
    const m: NetworkModel = { modelVersion: 1, meta: { name: 'Preview' }, devices: [{ id: 'admin', type, ...(type === 'firewall' ? { platform: 'asa' as const } : {}), interfaces: [], security: { enableSecret: 'admin' } }], links: [] }
    const config = generateConfig(m, m.devices[0])
    assert.equal(config.device, 'admin')
    assert.match(config.text, /^hostname admin$/m)
    assert.match(config.text, /enable (?:secret|password) <SECRET>/)
    const data = buildViewerData(analyze(m)) as { devices: { id: string; config: string }[] }
    assert.equal(data.devices[0].id, 'admin')
    assert.match(data.devices[0].config, /^hostname admin$/m)
    assert.match(buildDocs(analyze(m)), /^hostname admin$/m)
  }
})
