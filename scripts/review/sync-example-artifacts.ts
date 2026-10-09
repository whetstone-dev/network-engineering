// Regenerate committed example diagrams, or check that they match the models/viewer.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NetworkModel } from '../lib/model.ts'
import { analyze } from '../lib/validate.ts'
import { diffModels } from '../lib/diff.ts'
import { renderHtml } from '../lib/render.ts'
import { safeOutputPath } from '../lib/output.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const check = process.argv.includes('--check')
if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: node scripts/review/sync-example-artifacts.ts [--check]')
const examples = join(root, 'examples')
const output = join(examples, 'rendered')
const load = (file: string): NetworkModel => JSON.parse(readFileSync(join(examples, file), 'utf8'))
const artifacts = readdirSync(examples).filter((file) => file.endsWith('.net.json')).sort().map((file) => ({
  path: safeOutputPath(output, file.replace(/\.net\.json$/, '.html')),
  html: renderHtml(analyze(load(file))),
}))
const old = analyze(load('pt-3vlan-roas-dhcp.net.json'))
const current = analyze(load('troubleshooting-broken-lab.net.json'))
artifacts.push({ path: safeOutputPath(output, 'diff-lab-vs-broken.html'), html: renderHtml(current, { old, diff: diffModels(old, current) }) })
let stale = 0
for (const artifact of artifacts) {
  if (check) {
    if (!existsSync(artifact.path) || readFileSync(artifact.path, 'utf8') !== artifact.html) {
      console.error(`Stale example artifact: ${artifact.path}`)
      stale++
    }
  } else {
    mkdirSync(dirname(artifact.path), { recursive: true })
    writeFileSync(safeOutputPath(output, artifact.path), artifact.html)
  }
}
if (stale) process.exitCode = 1
else console.log(`${check ? 'Checked' : 'Regenerated'} ${artifacts.length} example diagrams.`)
