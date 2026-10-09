import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Server-only: reads the skill version from SKILL.md at build time, so the site never drifts from the release.
// The build runs from web/, so SKILL.md is one level up.
function readSkillVersion(): string {
  const path = join(process.cwd(), '..', 'SKILL.md');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${path} to get the skill version: ${(error as Error).message}`);
  }
  const match = text.match(/^\s*version:\s*"?(\d+\.\d+\.\d+)"?\s*$/m);
  if (!match) throw new Error(`No "version: x.y.z" found in the metadata of ${path}.`);
  return match[1];
}

export const VERSION = readSkillVersion();
