import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { CurationConfig } from '../../scripts/build-playlist/config';
import { run } from '../../scripts/build-playlist/index';
import type { Lastfm } from '../../scripts/build-playlist/lastfm';
import type { Youtube, YtVideo } from '../../scripts/build-playlist/youtube';

const cfg: CurationConfig = {
  seedArtists: ['Seed One', 'Seed Two', 'Seed Three'],
  trustedChannels: [{ name: 'KEXP', channelId: 'UCkexp' }],
  genreTags: ['rock'],
  discoveryDepth: 1,
  similarPerArtist: 10,
  maxVideosPerArtist: 3,
  seedShare: 0.333,
  artistGapSeconds: 0,
  maxTotalSeconds: 86400,
  minViews: 2000,
  shuffleSeed: 1,
};

const similar: Record<string, string[]> = { 'Seed One': ['Disc A', 'Disc B'], 'Seed Two': ['Disc C', 'Disc D'] };
const listeners: Record<string, number> = { 'Seed One': 90000, 'Seed Two': 50000, 'Seed Three': 1000, 'Disc A': 500, 'Disc B': 800, 'Disc C': 300, 'Disc D': 100 };

const lastfm: Lastfm = {
  similar: async (artist) => similar[artist] ?? [],
  info: async (artist) => (artist in listeners ? { name: artist, listeners: listeners[artist], tags: ['rock'] } : null),
  album: async (artist, track) => (artist === 'Seed One' && track === 'First Light' ? 'Debut' : undefined),
};

const yt = (id: string, title: string, channelTitle: string, over: Partial<YtVideo> = {}): YtVideo => ({
  id, title, channelId: `UC${channelTitle}`, channelTitle, durationSeconds: 240, views: 50000, embeddable: true, public: true, ...over,
});

const channels: Record<string, string> = {
  'Seed One': 'UCseed1', 'Seed Two': 'UCseed2', 'Disc A': 'UCdiscA', 'Disc B': 'UCdiscB', 'Disc C': 'UCdiscC',
  // Seed Three and Disc D have no channel.
};

const uploads: Record<string, YtVideo[]> = {
  UCseed1: [
    yt('s1a', 'Seed One - First Light (Official Video)', 'Seed One'),
    yt('s1b', 'Second Wind', 'Seed One'), // no "Artist -" prefix on their own channel
    yt('s1long', 'Seed One - Live at the Hall', 'Seed One', { durationSeconds: 7200 }),
  ],
  UCseed2: [yt('s2a', 'Seed Two - Undertow', 'Seed Two'), yt('s2other', 'Other Band - Not Theirs', 'Seed Two')],
  UCdiscA: [yt('daTopic', 'Disc A - Auto Upload', 'Disc A - Topic')],
  UCdiscB: [yt('db1', 'Disc B - Bright', 'Disc B')],
  UCdiscC: [yt('dc1', 'Disc C - Cold', 'Disc C'), yt('dupe', 'Disc C - Shared (Live on KEXP)', 'Disc C')],
  UCkexp: [
    yt('k1', 'Disc D - Deep Water (Live on KEXP)', 'KEXP'),
    yt('k2', 'Unknown Act - Elsewhere (Live on KEXP)', 'KEXP'),
    yt('dupe', 'Disc C - Shared (Live on KEXP)', 'KEXP'),
  ],
};

const youtube: Youtube = {
  findArtistChannel: async (artist) => (channels[artist] ? { channelId: channels[artist], title: artist } : null),
  uploads: async (channelId) => uploads[channelId] ?? [],
};

const go = () => run({ cfg, lastfm, youtube, now: new Date('2026-11-15T12:00:00Z'), cacheDir: mkdtempSync(join(tmpdir(), 'fuzzy-run-')) });

describe('run', () => {
  test('builds a filtered, attributed playlist', async () => {
    const { playlist } = await go();
    const ids = playlist.videos.map((v) => v.id).sort();
    expect(ids).toEqual(['db1', 'dc1', 'dupe', 'k1', 's1a', 's1b', 's2a']);
  });

  test('excludes the long video, the Topic video, and the unmatched trusted upload', async () => {
    const ids = (await go()).playlist.videos.map((v) => v.id);
    expect(ids).not.toContain('s1long');
    expect(ids).not.toContain('daTopic');
    expect(ids).not.toContain('k2');
    expect(ids).not.toContain('s2other');
  });

  test('attributes a trusted-channel upload to the graph artist', async () => {
    const k1 = (await go()).playlist.videos.find((v) => v.id === 'k1')!;
    expect(k1).toEqual({ id: 'k1', artist: 'Disc D', title: 'Deep Water (Live on KEXP)', durationSeconds: 240, source: 'discovered' });
  });

  test('cleans titles and adds albums when Last.fm knows them', async () => {
    const s1a = (await go()).playlist.videos.find((v) => v.id === 's1a')!;
    expect(s1a).toMatchObject({ artist: 'Seed One', title: 'First Light', album: 'Debut', source: 'seed' });
  });

  test('totalSeconds is the sum of durations; generatedAt is now', async () => {
    const { playlist } = await go();
    expect(playlist.totalSeconds).toBe(playlist.videos.reduce((s, v) => s + v.durationSeconds, 0));
    expect(playlist.generatedAt).toBe('2026-11-15T12:00:00.000Z');
  });

  test('report covers artists, missing channels, rejections, and totals', async () => {
    const report = (await go()).report.join('\n');
    expect(report).toMatch(/artists: 7 \(3 seed, 4 discovered\)/);
    expect(report).toMatch(/no YouTube channel: 2/);
    expect(report).toMatch(/rejected: 2 \(.*too long: 1.*\)/);
    expect(report).toMatch(/Topic channel: 1/);
    expect(report).toMatch(/playlist: 7 videos/);
    expect(report).toMatch(/seed share/);
  });
});
