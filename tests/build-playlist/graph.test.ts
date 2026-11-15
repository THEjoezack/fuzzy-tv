import { describe, expect, test } from 'vitest';
import type { CurationConfig } from '../../scripts/build-playlist/config';
import { expandArtists } from '../../scripts/build-playlist/graph';
import type { Lastfm } from '../../scripts/build-playlist/lastfm';

const cfg = (over: Partial<CurationConfig> = {}): CurationConfig => ({
  seedArtists: ['A'],
  trustedChannels: [],
  genreTags: ['rock', 'post-punk'],
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

type Info = { name: string; listeners: number; tags: string[] };

function fakeLastfm(similar: Record<string, string[]>, infos: Record<string, Info>): Lastfm {
  return {
    similar: async (artist) => similar[artist] ?? [],
    info: async (artist) => infos[artist] ?? null,
    album: async () => undefined,
  };
}

const infos: Record<string, Info> = {
  A: { name: 'A', listeners: 1000, tags: ['jazz'] }, // seeds are kept regardless of tags
  B: { name: 'B', listeners: 500, tags: ['Rock'] },
  C: { name: 'C', listeners: 300, tags: ['jazz'] },
  D: { name: 'D', listeners: 100, tags: ['post-punk'] },
};

describe('expandArtists', () => {
  test('depth 2 keeps the seed and genre-matched discoveries', async () => {
    const lastfm = fakeLastfm({ A: ['B', 'C'], B: ['D'] }, infos);
    const nodes = await expandArtists(cfg(), lastfm);
    expect(nodes.map((n) => [n.name, n.source])).toEqual([['A', 'seed'], ['B', 'discovered'], ['D', 'discovered']]);
    expect(nodes.find((n) => n.name === 'D')!.listeners).toBe(100);
  });

  test('depth 1 stops after direct neighbours', async () => {
    const lastfm = fakeLastfm({ A: ['B', 'C'], B: ['D'] }, infos);
    const nodes = await expandArtists(cfg({ discoveryDepth: 1 }), lastfm);
    expect(nodes.map((n) => n.name)).toEqual(['A', 'B']);
  });

  test('a cycle back to the seed neither loops nor duplicates', async () => {
    const lastfm = fakeLastfm({ A: ['B', 'C'], B: ['D'], D: ['A', 'a'] }, infos);
    const nodes = await expandArtists(cfg({ discoveryDepth: 5 }), lastfm);
    expect(nodes.map((n) => n.name)).toEqual(['A', 'B', 'D']);
  });

  test('de-duplicates case-insensitively', async () => {
    const lastfm = fakeLastfm({ A: ['B', 'b'] }, infos);
    const nodes = await expandArtists(cfg({ discoveryDepth: 1 }), lastfm);
    expect(nodes.map((n) => n.name)).toEqual(['A', 'B']);
  });

  test('a seed Last.fm does not know is still kept', async () => {
    const lastfm = fakeLastfm({}, {});
    const nodes = await expandArtists(cfg({ seedArtists: ['Unknown Band'] }), lastfm);
    expect(nodes).toEqual([{ name: 'Unknown Band', listeners: 0, tags: [], source: 'seed' }]);
  });
});
