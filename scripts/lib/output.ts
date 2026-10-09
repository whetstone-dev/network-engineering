import { lstatSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Resolve generated children within the selected destination; refuse existing links. */
export function safeOutputPath(directory: string, ...parts: string[]): string {
  const root = resolve(directory)
  const target = resolve(root, ...parts)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Generated output path must stay inside the destination directory.')
  let current = root
  for (const part of ['', ...rel.split(sep)]) {
    if (part) current = join(current, part)
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error('Generated output may not traverse or overwrite a symbolic link.')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  return target
}
