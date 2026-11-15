import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../scripts/build-playlist/config';

const SHIPPED = 'curation/seeds.json';

function withConfig(value: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'fuzzy-cfg-')), 'seeds.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}

const shipped = () => JSON.parse(readFileSync(SHIPPED, 'utf8'));

describe('loadConfig', () => {
  test('accepts the shipped seeds.json', () => {
    const cfg = loadConfig(SHIPPED);
    expect(cfg.seedArtists).toContain('SLIFT');
    expect(cfg.trustedChannels[0]).toEqual({ name: 'KEXP', channelId: 'UC3I2GFN_F8WudD_2jUZbojA' });
  });

  test('rejects {} naming a missing field', () => {
    expect(() => loadConfig(withConfig({}))).toThrow(/seedArtists/);
  });

  test('rejects seedShare outside 0–1', () => {
    expect(() => loadConfig(withConfig({ ...shipped(), seedShare: 2 }))).toThrow(/seedShare/);
  });

  test('rejects empty seedArtists', () => {
    expect(() => loadConfig(withConfig({ ...shipped(), seedArtists: [] }))).toThrow(/seedArtists/);
  });

  test('rejects a wrongly typed number field', () => {
    expect(() => loadConfig(withConfig({ ...shipped(), minViews: '2000' }))).toThrow(/minViews/);
  });

  test('rejects a malformed trusted channel', () => {
    expect(() => loadConfig(withConfig({ ...shipped(), trustedChannels: [{ name: 'KEXP' }] }))).toThrow(/trustedChannels/);
  });

  test('rejects invalid JSON with the file path', () => {
    const path = withConfig({});
    writeFileSync(path, '{ nope');
    expect(() => loadConfig(path)).toThrow(path);
  });
});
