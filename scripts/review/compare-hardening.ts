// Reproducible before/after comparison. Reads git history; never commits or pushes.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baseline = process.argv[2] ?? '5a05aab'
function git(...args: string[]): string {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 })
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || 'Could not read git history')
  return r.stdout
}
function write(path: string, text: string): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const baseCommit = git('rev-parse', '--verify', `${baseline}^{commit}`).trim()
const tempRoot = resolve(tmpdir())
const checkout = mkdtempSync(join(tempRoot, 'netlab-before-'))
const testFiles = ['scripts/test/netlab.test.ts', 'scripts/test/hardening.test.ts', 'scripts/test/schema.test.ts', 'scripts/test/viewer-security.test.ts']
const evidence = join(root, 'docs/reviews/hardening-comparison')
function run(dir: string, name: string): Record<string, unknown> {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], { cwd: dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 })
  if (r.error) throw r.error
  const output = r.stdout + r.stderr
  // Node indents blank lines in assertion blocks; normalize trailing spaces so
  // generated evidence can be committed without whitespace-check failures.
  write(join(evidence, `${name}.tap`), output.replace(/[\t ]+$/gm, ''))
  const count = (label: string): number => Number(output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? -1)
  return { exitCode: r.status, tests: count('tests'), pass: count('pass'), fail: count('fail') }
}
try {
  const files = git('ls-tree', '-r', '--name-only', baseCommit).trim().split('\n')
    .filter((f) => /^(scripts\/|assets\/|schemas\/|templates\/|examples\/)/.test(f) && !f.startsWith('examples/rendered/'))
  for (const file of files) write(join(checkout, file), git('show', `${baseCommit}:${file}`))
  // The same tests run against both implementations, including corrected unknown-test fixtures.
  for (const file of testFiles) write(join(checkout, file), readFileSync(join(root, file), 'utf8'))
  const before = run(checkout, 'before')
  const after = run(root, 'after')
  const comparison = { baseCommit, comparedAt: new Date().toISOString(), node: process.version, platform: process.platform, testFiles, before, after }
  write(join(evidence, 'comparison.json'), JSON.stringify(comparison, null, 2) + '\n')
  console.log(JSON.stringify(comparison, null, 2))
  if (after.fail !== 0 || after.tests !== before.tests || Number(after.pass) <= Number(before.pass)) process.exitCode = 1
} finally {
  const rel = relative(tempRoot, resolve(checkout))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Refusing cleanup outside the temporary directory')
  rmSync(checkout, { recursive: true, force: true })
}
