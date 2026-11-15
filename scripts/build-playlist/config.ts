import { readFileSync } from 'node:fs';

export interface CurationConfig {
  seedArtists: string[];
  trustedChannels: { name: string; channelId: string }[];
  genreTags: string[];
  discoveryDepth: number;
  similarPerArtist: number;
  maxVideosPerArtist: number;
  seedShare: number;
  artistGapSeconds: number;
  maxTotalSeconds: number;
  minViews: number;
  shuffleSeed: number;
}

const NUMBER_FIELDS = [
  'discoveryDepth',
  'similarPerArtist',
  'maxVideosPerArtist',
  'seedShare',
  'artistGapSeconds',
  'maxTotalSeconds',
  'minViews',
  'shuffleSeed',
] as const;

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim() !== '');

/** Reads and validates curation/seeds.json. Throws a readable message on any problem. */
export function loadConfig(path: string): CurationConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${path}: can't read config (${(e as Error).message})`);
  }
  const fail = (msg: string): never => {
    throw new Error(`${path}: ${msg}`);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('expected a JSON object');
  const o = raw as Record<string, unknown>;

  if (!isStringArray(o.seedArtists) || o.seedArtists.length === 0) fail('seedArtists must be a non-empty list of artist names');
  if (!isStringArray(o.genreTags)) fail('genreTags must be a list of tags');
  if (
    !Array.isArray(o.trustedChannels) ||
    !o.trustedChannels.every((c) => typeof c?.name === 'string' && typeof c?.channelId === 'string' && c.channelId !== '')
  ) {
    fail('trustedChannels must be a list of { name, channelId }');
  }
  for (const field of NUMBER_FIELDS) {
    const v = o[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`${field} must be a non-negative number`);
  }
  if ((o.seedShare as number) > 1) fail('seedShare must be between 0 and 1');

  return o as unknown as CurationConfig;
}
