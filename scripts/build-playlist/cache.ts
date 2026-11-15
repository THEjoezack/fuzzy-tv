import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Permanent JSON cache for expensive API calls. Entries never expire:
 * delete the folder to refresh. Failures are not cached.
 */
export async function cached<T>(key: string, fn: () => Promise<T>, dir = 'curation/cache'): Promise<T> {
  const file = join(dir, `${createHash('sha1').update(key).digest('hex')}.json`);
  try {
    // Wrapped so that null/undefined results are distinguishable from a miss.
    return (JSON.parse(readFileSync(file, 'utf8')) as { key: string; value: T }).value;
  } catch {
    // miss
  }
  const value = await fn();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ key, value }));
  return value;
}
