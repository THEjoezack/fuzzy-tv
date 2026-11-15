import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { expect, test } from 'vitest';

const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/;
// Anchored at line start so prose that mentions `YOUTUBE_API_KEY=` doesn't count.
const ENV_LINE = /^\s*(?:export\s+)?(?:YOUTUBE_API_KEY|LASTFM_API_KEY)\s*=\s*\S/m;

function repoFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function readText(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null;
    const buf = readFileSync(path);
    if (buf.includes(0)) return null; // binary
    return buf.toString('utf8');
  } catch {
    return null; // deleted from the working tree but still in the index
  }
}

test('no API keys in tracked or untracked files', () => {
  const offenders: string[] = [];
  for (const file of repoFiles()) {
    const text = readText(file);
    if (text === null) continue;
    if (GOOGLE_KEY.test(text)) offenders.push(`${file}: Google API key`);
    if (file !== '.env.example' && ENV_LINE.test(text)) offenders.push(`${file}: API key assignment`);
  }
  expect(offenders).toEqual([]);
});

test('.env is gitignored', () => {
  expect(spawnSync('git', ['check-ignore', '-q', '.env']).status).toBe(0);
});
