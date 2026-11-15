import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Playlist } from '../../src/types';
import { cached } from './cache';
import { loadConfig, type CurationConfig } from './config';
import { normalize, parseTitle, passesFilters } from './filters';
import { expandArtists, type ArtistNode } from './graph';
import { createLastfm, type Lastfm } from './lastfm';
import { buildOrder, type Candidate } from './order';
import { createYoutube, type Youtube, type YtVideo } from './youtube';

const ARTIST_UPLOADS = 50;
// Session channels post daily, so look further back than an artist channel.
const TRUSTED_UPLOADS = 500;
const OUTPUT = 'public/videos.json';

export async function run(opts: {
  cfg: CurationConfig;
  lastfm: Lastfm;
  youtube: Youtube;
  now: Date;
  cacheDir?: string;
}): Promise<{ playlist: Playlist; report: string[] }> {
  const { cfg, lastfm, youtube, now, cacheDir = 'curation/cache' } = opts;
  const uploadsOf = (channelId: string, max: number) =>
    cached(`uploads:${channelId}:${max}`, () => youtube.uploads(channelId, max), cacheDir);

  const nodes = await expandArtists(cfg, lastfm);
  const byKey = new Map(nodes.map((n) => [normalize(n.name), n]));

  const found: { video: YtVideo; node: ArtistNode; title: string }[] = [];
  const noChannel: string[] = [];

  for (const node of nodes) {
    const channel = await cached(`channel:${node.name}`, () => youtube.findArtistChannel(node.name), cacheDir);
    if (!channel) {
      noChannel.push(node.name);
      continue;
    }
    for (const video of await uploadsOf(channel.channelId, ARTIST_UPLOADS)) {
      // On their own channel a bare "Song" title is theirs; "Someone Else - Song" isn't.
      const parsed = parseTitle(video.title);
      if (parsed.artist !== undefined && normalize(parsed.artist) !== normalize(node.name)) continue;
      found.push({ video, node, title: parsed.title });
    }
  }

  for (const trusted of cfg.trustedChannels) {
    for (const video of await uploadsOf(trusted.channelId, TRUSTED_UPLOADS)) {
      const parsed = parseTitle(video.title);
      const node = parsed.artist === undefined ? undefined : byKey.get(normalize(parsed.artist));
      if (node) found.push({ video, node, title: parsed.title });
    }
  }

  const rejections = new Map<string, number>();
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const { video, node, title } of found) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    const verdict = passesFilters(video, cfg);
    if (!verdict.ok) {
      rejections.set(verdict.reason, (rejections.get(verdict.reason) ?? 0) + 1);
      continue;
    }
    candidates.push({
      id: video.id,
      artist: node.name,
      title,
      durationSeconds: video.durationSeconds,
      source: node.source,
      listeners: node.listeners,
      views: video.views,
    });
  }

  const videos = buildOrder(candidates, cfg);
  for (const v of videos) {
    const album = await cached(`album:${v.artist}|${v.title}`, () => lastfm.album(v.artist, v.title), cacheDir);
    if (album) v.album = album;
  }

  const totalSeconds = videos.reduce((s, v) => s + v.durationSeconds, 0);
  const seeds = nodes.filter((n) => n.source === 'seed').length;
  const rejected = [...rejections.values()].reduce((a, b) => a + b, 0);
  const seedVideos = videos.filter((v) => v.source === 'seed').length;
  const report = [
    `artists: ${nodes.length} (${seeds} seed, ${nodes.length - seeds} discovered)`,
    `no YouTube channel: ${noChannel.length}${noChannel.length ? ` (${noChannel.join(', ')})` : ''}`,
    `candidates: ${found.length} found, ${candidates.length} passed filters`,
    `rejected: ${rejected} (${[...rejections].map(([reason, n]) => `${reason}: ${n}`).join(', ') || 'none'})`,
    `playlist: ${videos.length} videos, ${(totalSeconds / 3600).toFixed(1)} hours, seed share ${videos.length ? Math.round((seedVideos / videos.length) * 100) : 0}%`,
  ];

  return { playlist: { generatedAt: now.toISOString(), totalSeconds, videos }, report };
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    throw new Error('No .env file. Copy .env.example to .env and fill in YOUTUBE_API_KEY and LASTFM_API_KEY.');
  }
  const { YOUTUBE_API_KEY, LASTFM_API_KEY } = process.env;
  if (!YOUTUBE_API_KEY || !LASTFM_API_KEY) throw new Error('.env needs both YOUTUBE_API_KEY and LASTFM_API_KEY.');

  const { playlist, report } = await run({
    cfg: loadConfig('curation/seeds.json'),
    lastfm: createLastfm(LASTFM_API_KEY, fetch),
    youtube: createYoutube(YOUTUBE_API_KEY, fetch),
    now: new Date(),
  });
  for (const line of report) console.log(line);
  if (playlist.videos.length === 0) throw new Error(`No videos survived; leaving ${OUTPUT} unchanged.`);
  writeFileSync(OUTPUT, `${JSON.stringify(playlist, null, 2)}\n`);
  console.log(`wrote ${OUTPUT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: Error) => {
    console.error(`build:playlist failed: ${e.message}`);
    process.exit(1);
  });
}
