import type { Video } from '../../src/types';
import type { CurationConfig } from './config';
import { normalize } from './filters';

export type Candidate = Video & { listeners: number; views?: number };

interface ArtistQueue {
  source: Video['source'];
  weight: number;
  videos: Video[];
}

/** Small seeded PRNG so rebuilds with the same shuffleSeed are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function strip({ listeners: _l, views: _v, ...video }: Candidate): Video {
  return video;
}

/**
 * Orders candidates into the broadcast loop: per-artist cap, ~seedShare of
 * slots for seed artists, a minimum playlist-time gap between airings of the
 * same artist (relaxed only when nothing else is left), smaller artists
 * weighted up, and a total-length cap.
 */
export function buildOrder(candidates: Candidate[], cfg: CurationConfig): Video[] {
  const rng = mulberry32(cfg.shuffleSeed);

  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = normalize(c.artist);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const queues = new Map<string, ArtistQueue>();
  for (const [key, group] of groups) {
    const top = [...group]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, cfg.maxVideosPerArtist);
    queues.set(key, {
      source: group[0].source,
      weight: 1 / Math.log10(group[0].listeners + 10),
      videos: shuffle(top.map(strip), rng),
    });
  }

  const out: Video[] = [];
  const lastAired = new Map<string, number>();
  const airings = new Map<string, number>();
  let clock = 0;
  let seedCount = 0;

  while (clock < cfg.maxTotalSeconds) {
    const remaining = [...queues].filter(([, q]) => q.videos.length > 0);
    if (remaining.length === 0) break;

    const wantSeed = cfg.seedShare > 0 && (out.length === 0 || seedCount / out.length < cfg.seedShare);
    const wanted = remaining.filter(([, q]) => (q.source === 'seed') === wantSeed);
    const pool = wanted.length > 0 ? wanted : remaining;

    let eligible = pool.filter(([key]) => !lastAired.has(key) || clock - lastAired.get(key)! >= cfg.artistGapSeconds);
    if (eligible.length === 0) {
      // Relax the gap: the artist that aired longest ago goes next.
      const oldest = pool.reduce((a, b) => (lastAired.get(a[0])! <= lastAired.get(b[0])! ? a : b));
      eligible = [oldest];
    }

    // Least-aired artists go first, so repeats sit about a full rotation apart
    // and nobody is left with a pile of videos that only a relaxed gap could place.
    const fewest = Math.min(...eligible.map(([key]) => airings.get(key) ?? 0));
    eligible = eligible.filter(([key]) => (airings.get(key) ?? 0) === fewest);

    let r = rng() * eligible.reduce((sum, [, q]) => sum + q.weight, 0);
    let [key, queue] = eligible[eligible.length - 1];
    for (const entry of eligible) {
      r -= entry[1].weight;
      if (r < 0) {
        [key, queue] = entry;
        break;
      }
    }

    const video = queue.videos.shift()!;
    if (clock + video.durationSeconds > cfg.maxTotalSeconds) continue;
    out.push(video);
    lastAired.set(key, clock);
    airings.set(key, (airings.get(key) ?? 0) + 1);
    clock += video.durationSeconds;
    if (video.source === 'seed') seedCount++;
  }
  return out;
}
