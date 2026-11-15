import { describe, expect, test } from 'vitest';
import type { CurationConfig } from '../../scripts/build-playlist/config';
import { buildOrder, type Candidate } from '../../scripts/build-playlist/order';
import type { Video } from '../../src/types';

const cfg = (over: Partial<CurationConfig> = {}): CurationConfig => ({
  seedArtists: ['x'],
  trustedChannels: [],
  genreTags: [],
  discoveryDepth: 2,
  similarPerArtist: 10,
  maxVideosPerArtist: 3,
  seedShare: 0.333,
  artistGapSeconds: 10800,
  maxTotalSeconds: 86400,
  minViews: 2000,
  shuffleSeed: 1,
  ...over,
});

function mk(
  artist: string,
  n: number,
  { source = 'discovered', listeners = 10_000, dur = 300 }: { source?: Video['source']; listeners?: number; dur?: number } = {},
): Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${artist}-${i}`,
    artist,
    title: `song ${i}`,
    durationSeconds: dur,
    source,
    listeners,
    views: 1000 * (n - i),
  }));
}

const many = (count: number, n: number, opts?: Parameters<typeof mk>[2], prefix = 'artist') =>
  Array.from({ length: count }, (_, i) => mk(`${prefix}${i}`, n, opts)).flat();

const total = (videos: Video[]) => videos.reduce((s, v) => s + v.durationSeconds, 0);

/** Smallest playlist-time gap between consecutive airings of the same artist. */
function minGap(videos: Video[]): number {
  const last = new Map<string, number>();
  let clock = 0;
  let min = Infinity;
  for (const v of videos) {
    if (last.has(v.artist)) min = Math.min(min, clock - last.get(v.artist)!);
    last.set(v.artist, clock);
    clock += v.durationSeconds;
  }
  return min;
}

describe('buildOrder', () => {
  test('cap: at most maxVideosPerArtist per artist, the most-viewed ones', () => {
    const out = buildOrder([...mk('flood', 10), ...many(20, 1)], cfg());
    const flood = out.filter((v) => v.artist === 'flood');
    expect(flood).toHaveLength(3);
    expect(flood.map((v) => v.id).sort()).toEqual(['flood-0', 'flood-1', 'flood-2']);
  });

  test('cap groups artist names loosely ("The X" = "x")', () => {
    const out = buildOrder([...mk('The Band', 3), ...mk('band', 3), ...many(20, 1)], cfg());
    expect(out.filter((v) => /band/i.test(v.artist))).toHaveLength(3);
  });

  test('gap: consecutive airings of an artist are ≥ artistGapSeconds apart when the pool allows it', () => {
    const out = buildOrder(many(60, 3), cfg());
    expect(out).toHaveLength(180);
    expect(minGap(out)).toBeGreaterThanOrEqual(10800);
  });

  test('gap beats seed share: few seed artists do not repeat while discovered artists are eligible', () => {
    const out = buildOrder([...many(3, 3, { source: 'seed' }, 'seed'), ...many(120, 1)], cfg());
    expect(out).toHaveLength(129);
    expect(minGap(out)).toBeGreaterThanOrEqual(10800);
  });

  test('mix: about a third of the slots go to seed artists', () => {
    const out = buildOrder([...many(30, 1, { source: 'seed' }, 'seed'), ...many(60, 1)], cfg());
    const share = out.filter((v) => v.source === 'seed').length / out.length;
    expect(share).toBeGreaterThanOrEqual(0.25);
    expect(share).toBeLessThanOrEqual(0.42);
  });

  test('boost: a small artist comes first more often than a huge one', () => {
    const input = [...mk('small', 1, { listeners: 100 }), ...mk('huge', 1, { listeners: 5_000_000 })];
    let smallFirst = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (buildOrder(input, cfg({ seedShare: 0, shuffleSeed: seed }))[0].artist === 'small') smallFirst++;
    }
    expect(smallFirst).toBeGreaterThan(100);
  });

  test('deterministic: same seed → same order; different seed → different order', () => {
    const input = many(30, 3);
    const ids = (seed: number) => buildOrder(input, cfg({ shuffleSeed: seed })).map((v) => v.id);
    expect(ids(7)).toEqual(ids(7));
    expect(ids(7)).not.toEqual(ids(8));
  });

  test('24h cap: total never exceeds maxTotalSeconds', () => {
    const out = buildOrder(many(400, 1), cfg());
    expect(total(out)).toBeLessThanOrEqual(86400);
    expect(total(out)).toBeGreaterThan(86400 - 300);
  });

  test('tiny pool: one artist × 3 videos relaxes the gap and returns all 3', () => {
    const out = buildOrder(mk('solo', 3), cfg());
    expect(out.map((v) => v.id).sort()).toEqual(['solo-0', 'solo-1', 'solo-2']);
  });

  test('output carries no listeners or views fields', () => {
    const [v] = buildOrder(mk('solo', 1), cfg());
    expect(Object.keys(v).sort()).toEqual(['artist', 'durationSeconds', 'id', 'source', 'title']);
  });

  test('empty input → empty playlist', () => {
    expect(buildOrder([], cfg())).toEqual([]);
  });
});
