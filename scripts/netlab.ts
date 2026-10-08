#!/usr/bin/env node
// netlab — CLI for the network-engineering skill. Requires Node.js >= 22.18 (runs TypeScript natively).
// Usage: node scripts/netlab.ts <command> [arguments]   ·   node scripts/netlab.ts help

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { NetworkModel } from './lib/model.ts'
import { analyze } from './lib/validate.ts'
import type { Analysis } from './lib/validate.ts'
import { renderHtml } from './lib/render.ts'
import { generateAll, generateConfig } from './lib/ios.ts'
import { buildDocs } from './lib/docs.ts'
import { toMermaid } from './lib/mermaid.ts'
import { routeView } from './lib/l3.ts'
import { tracePing } from './lib/trace.ts'
import { eui64, splitIpv6, subnetInfo, vlsm } from './lib/ip.ts'
import { CATALOG, catalogInterfaces, lookupModel } from './lib/catalog.ts'
import { route6View } from './lib/l3v6.ts'
import { importConfigs } from './lib/importer.ts'
import { diffMarkdown, diffModels } from './lib/diff.ts'
import { SCHEMA_PATH } from './lib/schema.ts'

const AYUDA = `netlab — tools for the network-engineering skill

Network model (single source of truth): *.net.json file (see references/model.md)

  validate <model> [--json]             Validates: schema, links, VLANs/trunks, STP, HSRP, IPv4/IPv6, DHCP, routing, ACL, NAT, ASA, VPN, tests
  build    <model> [-o folder]          Generates everything: topology.html, README.md, configs/*.txt, topology.mmd, analysis.json
  render   <model> [-o file.html]       Self-contained interactive diagram (opens with a double click)
  config   <model> [--device ID] [-o folder]   IOS / IOS XE / ASA configurations and PT GUI instructions
  docs     <model> [-o file.md]         Infrastructure documentation in Markdown
  mermaid  <model> [-o file.mmd]        Mermaid diagram (secondary, for Markdown)
  trace    <model> <source> <target>    Simulates ping (forward and return) with LPM, ACL, NAT, HSRP, ASA and IPsec
  routes   <model> [--device ID] [--ipv6]   Simulated routing tables (IPv4 or IPv6)

Model lifecycle:
  init     <file.net.json> [--name "Network"]   Creates a base model linked to the JSON Schema (VS Code autocomplete)
  import   <files|folder...> -o network.net.json [--name "Network"]
                                       show running-config (+ show cdp neighbors [detail]) → model
  diff     <old.net.json> <new.net.json> [-o changes.html] [--json]
                                       Changes between versions: Markdown + diagram with what was added/removed
  schema                               Path to the model's JSON Schema

Calculators:
  subnet   <cidr>                       Network, broadcast, mask, wildcard, range, hosts
  vlsm     <block> <name:hosts>...      VLSM allocation (largest to smallest)
  ipv6     <prefix> --split <len> [--count N]   IPv6 subnets
  eui64    <mac> <prefix/64>            EUI-64 address
  catalog  [model]                      Known Packet Tracer models and their interfaces

Options: --json (JSON output where applicable)`

function args(): { pos: string[]; flags: Record<string, string | boolean> } {
  const pos: string[] = []
  const flags: Record<string, string | boolean> = {}
  const v = process.argv.slice(2)
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    if (a === '-o') flags.o = v[++i] ?? ''
    else if (a.startsWith('--')) {
      const k = a.slice(2)
      const sig = v[i + 1]
      if (sig !== undefined && !sig.startsWith('-') && ['device', 'split', 'count', 'out', 'name'].includes(k)) { flags[k] = sig; i++ } else flags[k] = true
    } else pos.push(a)
  }
  if (typeof flags.out === 'string') flags.o = flags.out
  return { pos, flags }
}

function loadModel(ruta: string | undefined): { model: NetworkModel; path: string } {
  if (!ruta) throw new Error('Missing model path (*.net.json).')
  const p = resolve(ruta)
  if (!existsSync(p)) throw new Error(`File not found: ${p}`)
  let texto: string
  try {
    texto = readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
  } catch (e) {
    throw new Error(`Could not read ${p}: ${(e as Error).message}`)
  }
  try {
    return { model: JSON.parse(texto) as NetworkModel, path: p }
  } catch (e) {
    throw new Error(`Invalid JSON in ${p}: ${(e as Error).message}`)
  }
}

function stem(p: string): string {
  return basename(p).replace(/\.net\.json$|\.json$/i, '')
}

function write(p: string, contenido: string): void {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, contenido, 'utf8')
}

/** Schema reference relative to the model file (VS Code resolves it for autocomplete). */
function schemaRef(destino: string): string {
  const rel = relative(dirname(destino), SCHEMA_PATH).replace(/\\/g, '/')
  return rel.startsWith('..') && rel.split('/').filter((x) => x === '..').length > 4 ? pathToFileURL(SCHEMA_PATH).href : rel
}

function leerEntradas(rutas: string[]): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  for (const r of rutas) {
    const p = resolve(r)
    if (!existsSync(p)) throw new Error(`Not found: ${p}`)
    const archivos = statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.(txt|cfg|conf|log|ios)$/i.test(f)).map((f) => join(p, f)) : [p]
    for (const f of archivos) out.push({ name: basename(f), text: readFileSync(f, 'utf8').replace(/^\uFEFF/, '') })
  }
  if (!out.length) throw new Error('No configuration files found (.txt, .cfg, .conf, .log).')
  return out
}

function printDiagnostics(a: Analysis): void {
  const icono = { error: 'ERROR  ', warning: 'WARN   ', info: 'note   ' }
  for (const d of a.diagnostics) {
    console.log(`${icono[d.severity]} [${d.code}] ${d.message}`)
    if (d.hint) console.log(`          → ${d.hint}`)
  }
  if (a.tests.length) {
    console.log('')
    for (const t of a.tests) {
      const r = t.passed === true ? 'OK  ' : t.passed === false ? 'FAIL' : '?   '
      console.log(`${r}  ping ${t.from} → ${t.to} (expected ${t.expect}): ${t.reason}`)
    }
  }
  console.log(`\nSummary: ${a.counts.error} errors, ${a.counts.warning} warnings, ${a.counts.info} notes · ${a.devices.size} devices, ${a.links.length} links`)
}

function analysisJson(a: Analysis): unknown {
  return {
    name: a.model.meta?.name, counts: a.counts, diagnostics: a.diagnostics,
    tests: a.tests.map((t) => ({ from: t.from, to: t.to, expect: t.expect, status: t.status, passed: t.passed, reason: t.reason, forward: t.forward, reverse: t.reverse })),
    segments: a.segments.map((s) => ({ id: s.id, vlans: s.vlans, interfaces: s.ifaces.map((i) => `${i.deviceId} ${i.name}`) })),
    routes: Object.fromEntries([...a.ctx.tables].map(([id, t]) => [id, t.map(routeView)])),
  }
}

function main(): number {
  const { pos, flags } = args()
  const cmd = pos.shift()
  const json = flags.json === true
  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h':
      console.log(AYUDA)
      return 0
    case 'validate': {
      const { model } = loadModel(pos[0])
      const a = analyze(model)
      if (json) console.log(JSON.stringify(analysisJson(a), null, 2)); else printDiagnostics(a)
      return a.counts.error ? 1 : 0
    }
    case 'render': {
      const { model, path } = loadModel(pos[0])
      const a = analyze(model)
      const out = resolve(typeof flags.o === 'string' ? flags.o : join(dirname(path), `${stem(path)}.html`))
      write(out, renderHtml(a))
      console.log(`Diagram: ${out}`)
      console.log(`Validation: ${a.counts.error} errors, ${a.counts.warning} warnings (see the Diagnostics tab).`)
      return 0
    }
    case 'config': {
      const { model, path } = loadModel(pos[0])
      const lista = typeof flags.device === 'string'
        ? model.devices.filter((d) => d.id === flags.device).map((d) => generateConfig(model, d))
        : generateAll(model)
      if (!lista.length) throw new Error(`Device "${flags.device}" does not exist.`)
      if (typeof flags.o === 'string') {
        for (const c of lista) write(join(resolve(flags.o), `${c.device}.txt`), c.text)
        console.log(`Configurations written to ${resolve(flags.o)} (${lista.length} files)`)
      } else {
        for (const c of lista) console.log(c.text)
      }
      return 0
    }
    case 'docs': {
      const { model, path } = loadModel(pos[0])
      const md = buildDocs(analyze(model))
      const out = resolve(typeof flags.o === 'string' ? flags.o : join(dirname(path), `${stem(path)}.md`))
      write(out, md)
      console.log(`Documentation: ${out}`)
      return 0
    }
    case 'mermaid': {
      const { model } = loadModel(pos[0])
      const mm = toMermaid(analyze(model))
      if (typeof flags.o === 'string') { write(resolve(flags.o), mm); console.log(`Mermaid: ${resolve(flags.o)}`) } else console.log(mm)
      return 0
    }
    case 'build': {
      const { model, path } = loadModel(pos[0])
      const a = analyze(model)
      const dir = resolve(typeof flags.o === 'string' ? flags.o : join(dirname(path), `${stem(path)}-build`))
      const configs = generateAll(model)
      write(join(dir, 'topology.html'), renderHtml(a))
      write(join(dir, 'README.md'), buildDocs(a, configs))
      write(join(dir, 'topology.mmd'), toMermaid(a))
      write(join(dir, 'analysis.json'), JSON.stringify(analysisJson(a), null, 2))
      for (const c of configs) write(join(dir, 'configs', `${c.device}.txt`), c.text)
      console.log(`Build in ${dir}`)
      console.log('  topology.html   interactive diagram')
      console.log('  README.md       documentation (inventory, IP, VLANs, ports, routing, configs, verification)')
      console.log(`  configs/        ${configs.length} files (IOS CLI or PT GUI instructions)`)
      console.log('  topology.mmd    Mermaid · analysis.json  diagnostics and tables')
      console.log(`Validation: ${a.counts.error} errors, ${a.counts.warning} warnings, ${a.counts.info} notes · tests ${a.tests.filter((t) => t.passed).length}/${a.tests.length} OK`)
      if (a.counts.error) console.log('There are errors: check "validate" before delivering the configurations.')
      return 0
    }
    case 'trace': {
      const { model } = loadModel(pos[0])
      if (!pos[1] || !pos[2]) throw new Error('Usage: trace <model> <source> <target>')
      const a = analyze(model)
      const r = tracePing(a.ctx, model, pos[1], pos[2])
      if (json) { console.log(JSON.stringify(r, null, 2)); return r.status === 'success' ? 0 : 1 }
      console.log(`ping ${r.from} → ${r.to}: ${r.status.toUpperCase()} — ${r.reason}`)
      const linea = (h: { device: string; in?: string; out?: string; note?: string }): string => `  ${h.device}${h.in ? ` [in ${h.in}]` : ''}${h.out ? ` [out ${h.out}]` : ''}${h.note ? ` (${h.note})` : ''}`
      if (r.forward.length) { console.log('Forward:'); r.forward.forEach((h) => console.log(linea(h))) }
      if (r.reverse.length) { console.log('Return:'); r.reverse.forEach((h) => console.log(linea(h))) }
      return r.status === 'success' ? 0 : 1
    }
    case 'routes': {
      const { model } = loadModel(pos[0])
      const a = analyze(model)
      if (flags.ipv6 === true) {
        const ids6 = typeof flags.device === 'string' ? [flags.device] : [...a.tables6.keys()]
        const salida6: Record<string, unknown> = {}
        if (!ids6.length) console.log('No L3 device has IPv6 addresses in the model.')
        for (const id of ids6) {
          const t = (a.tables6.get(id) ?? []).filter((r) => r.proto !== 'L').map(route6View)
          if (json) { salida6[id] = t; continue }
          console.log(`\n${id}  (simulated IPv6 · OSPFv3: cost ref-bw/bw)`)
          for (const r of t) console.log(`  ${r.code.padEnd(4)} ${r.prefix.padEnd(26)} ${r.adMetric.padEnd(9)} ${r.via}${r.iface ? `, ${r.iface}` : ''}`)
        }
        if (json) console.log(JSON.stringify(salida6, null, 2))
        return 0
      }
      const ids = typeof flags.device === 'string' ? [flags.device] : [...a.ctx.tables.keys()]
      const salida: Record<string, unknown> = {}
      for (const id of ids) {
        const t = a.ctx.tables.get(id)
        if (!t) { console.log(`${id}: not an L3 device in the model.`); continue }
        if (json) { salida[id] = t.map(routeView); continue }
        console.log(`\n${id}  (simulated · OSPF: cost ref-bw/bw · EIGRP: composite metric K1=K3=1 · no ECMP)`)
        for (const r of t.map(routeView)) console.log(`  ${r.code.padEnd(3)} ${r.prefix.padEnd(18)} ${r.adMetric.padEnd(9)} ${r.via}${r.iface ? `, ${r.iface}` : ''}`)
      }
      if (json) console.log(JSON.stringify(salida, null, 2))
      return 0
    }
    case 'init': {
      if (!pos[0]) throw new Error('Usage: init <file.net.json> [--name "Network"]')
      const destino = resolve(pos[0])
      if (existsSync(destino)) throw new Error(`${destino} already exists; it will not be overwritten.`)
      const base = JSON.parse(readFileSync(join(dirname(SCHEMA_PATH), '..', 'templates', 'model-skeleton.net.json'), 'utf8')) as NetworkModel
      const { $schema: _plantilla, ...resto } = base
      const modelo = { $schema: schemaRef(destino), ...resto, meta: { ...base.meta, name: typeof flags.name === 'string' ? flags.name : base.meta.name } }
      write(destino, JSON.stringify(modelo, null, 2) + '\n')
      console.log(`Model created: ${destino}\nSchema: ${modelo.$schema} (autocomplete and validation in VS Code)`)
      return 0
    }
    case 'schema': {
      console.log(SCHEMA_PATH)
      return 0
    }
    case 'import': {
      if (!pos.length) throw new Error('Usage: import <files|folder...> -o network.net.json [--name "Network"]')
      const { model, report } = importConfigs(leerEntradas(pos), typeof flags.name === 'string' ? flags.name : undefined)
      const destino = resolve(typeof flags.o === 'string' ? flags.o : 'imported-network.net.json')
      const conSchema = { $schema: schemaRef(destino), ...model }
      write(destino, JSON.stringify(conSchema, null, 2) + '\n')
      for (const r of report) console.log(`- ${r}`)
      const a = analyze(model)
      console.log(`\nModel: ${destino}\nValidation: ${a.counts.error} errors, ${a.counts.warning} warnings, ${a.counts.info} notes (run "validate" for details).`)
      return 0
    }
    case 'diff': {
      if (!pos[0] || !pos[1]) throw new Error('Usage: diff <old.net.json> <new.net.json> [-o changes.html] [--json]')
      const A = loadModel(pos[0])
      const B = loadModel(pos[1])
      const aa = analyze(A.model)
      const ab = analyze(B.model)
      const d = diffModels(aa, ab)
      if (json) { console.log(JSON.stringify(d, null, 2)); return 0 }
      console.log(diffMarkdown(d, A.model.meta?.name ?? basename(A.path), B.model.meta?.name ?? basename(B.path)))
      if (typeof flags.o === 'string') {
        write(resolve(flags.o), renderHtml(ab, { diff: d, old: aa }))
        console.log(`Diagram with changes: ${resolve(flags.o)}`)
      }
      return 0
    }
    case 'subnet': {
      const info = subnetInfo(pos[0] ?? '')
      if (json) { console.log(JSON.stringify(info, null, 2)); return 0 }
      const filas: [string, string | number | boolean][] = [
        ['Network', info.cidr], ['Mask', info.mask], ['Wildcard', info.wildcard], ['Broadcast', info.broadcast],
        ['First host', info.firstHost], ['Last host', info.lastHost], ['Usable hosts', info.usableHosts],
        ['Addresses', info.totalAddresses], ['Class', info.ipClass], ['Private RFC 1918', info.isPrivate ? 'yes' : 'no'],
      ]
      for (const [k, v] of filas) console.log(`${k.padEnd(17)} ${v}`)
      return 0
    }
    case 'vlsm': {
      const base = pos.shift()
      if (!base || !pos.length) throw new Error('Usage: vlsm <block> <name:hosts> ...   e.g.: vlsm 192.168.0.0/24 SALES:60 IT:25 WAN:2')
      const req = pos.map((p) => {
        const [name, h] = p.split(':')
        if (!name || !h || !/^\d+$/.test(h)) throw new Error(`Invalid request "${p}" (format name:hosts)`)
        return { name, hosts: Number(h) }
      })
      const res = vlsm(base, req)
      if (json) { console.log(JSON.stringify(res, null, 2)); return 0 }
      console.log('| Name | Requested hosts | Network | Mask | Gateway (1st usable) | Last host | Broadcast | Usable hosts |')
      console.log('|---|---|---|---|---|---|---|---|')
      for (const r of res) console.log(`| ${r.name} | ${r.requestedHosts} | ${r.cidr} | ${r.mask} | ${r.firstHost} | ${r.lastHost} | ${r.broadcast} | ${r.usableHosts} |`)
      return 0
    }
    case 'ipv6': {
      const len = Number(flags.split)
      if (!pos[0] || !Number.isInteger(len)) throw new Error('Usage: ipv6 <prefix> --split <length> [--count N]   e.g.: ipv6 2001:db8:acad::/48 --split 64 --count 4')
      const lista = splitIpv6(pos[0], len, Number(flags.count ?? 8))
      if (json) console.log(JSON.stringify(lista, null, 2)); else lista.forEach((s) => console.log(s))
      return 0
    }
    case 'eui64': {
      if (!pos[0] || !pos[1]) throw new Error('Usage: eui64 <mac> <prefix/64>')
      console.log(eui64(pos[0], pos[1]))
      return 0
    }
    case 'catalog': {
      if (pos[0]) {
        const e = lookupModel(pos[0])
        if (!e) throw new Error(`Model "${pos[0]}" is not in the catalog. Known: ${CATALOG.map((c) => c.model).join(', ')}`)
        if (json) { console.log(JSON.stringify({ ...e, modular: e.modular?.map(String), expanded: catalogInterfaces(e) }, null, 2)); return 0 }
        console.log(`${e.model} (${e.type}, ${e.platform})\nInterfaces: ${e.interfaces.join(', ')}${e.modular ? '\nModular: ' + e.modular.map(String).join(', ') : ''}`)
        for (const n of e.notes) console.log(`- ${n}`)
        return 0
      }
      for (const e of CATALOG) console.log(`${e.model.padEnd(15)} ${e.type.padEnd(16)} ${e.interfaces.join(', ')}`)
      return 0
    }
    default:
      throw new Error(`Unknown command "${cmd}". Use "help".`)
  }
}

try {
  process.exitCode = main()
} catch (e) {
  console.error(`Error: ${(e as Error).message}`)
  process.exitCode = 1
}
