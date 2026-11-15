import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { cached } from '../../scripts/build-playlist/cache';

const tempDir = () => mkdtempSync(join(tmpdir(), 'fuzzy-cache-'));

test('second call with the same key is served from disk', async () => {
  const dir = tempDir();
  let calls = 0;
  const fn = async () => ({ n: ++calls });
  expect(await cached('k', fn, dir)).toEqual({ n: 1 });
  expect(await cached('k', fn, dir)).toEqual({ n: 1 });
  expect(calls).toBe(1);
  expect(readdirSync(dir)).toHaveLength(1);
});

test('different keys do not collide', async () => {
  const dir = tempDir();
  expect(await cached('a', async () => 'A', dir)).toBe('A');
  expect(await cached('b', async () => 'B', dir)).toBe('B');
});

test('null and undefined results are cached too', async () => {
  const dir = tempDir();
  let calls = 0;
  await cached('none', async () => { calls++; return undefined; }, dir);
  expect(await cached('none', async () => { calls++; return undefined; }, dir)).toBeUndefined();
  await cached('null', async () => { calls++; return null; }, dir);
  expect(await cached('null', async () => { calls++; return null; }, dir)).toBeNull();
  expect(calls).toBe(2);
});

test('a failing fn caches nothing', async () => {
  const dir = tempDir();
  await expect(cached('bad', async () => { throw new Error('quota'); }, dir)).rejects.toThrow('quota');
  expect(await cached('bad', async () => 'ok', dir)).toBe('ok');
});
