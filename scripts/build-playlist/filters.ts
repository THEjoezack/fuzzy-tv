import type { CurationConfig } from './config';
import type { YtVideo } from './youtube';

const MIN_SECONDS = 60;
const MAX_SECONDS = 600;
const DENY = /\b(full (set|album|concert|show|performance)|reaction|tutorial|lesson|interview|teaser|trailer|cover)\b|#shorts/i;
const SEPARATOR = / [-–—] /;
const JUNK_SUFFIX = /\s*[([]([^()[\]]*)[)\]]\s*$/;
const JUNK_WORDS = /official|video|visuali[sz]er|lyric|audio|\bhd\b|\b4k\b/i;

/** Comparison key for artist names: "The King Gizzard & ..." ≈ "king gizzard and ...". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .trim()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

function clean(title: string): string {
  let t = title.trim();
  for (let m = t.match(JUNK_SUFFIX); m && JUNK_WORDS.test(m[1]); m = t.match(JUNK_SUFFIX)) {
    t = t.slice(0, m.index).trim();
  }
  return t.replace(/^["“](.*)["”]$/, '$1').trim();
}

/**
 * "Artist - Title (Official Video)" → { artist, title }. With a known artist,
 * a left side that isn't that artist means the split can't be trusted, so the
 * whole cleaned title comes back with no artist.
 */
export function parseTitle(raw: string, knownArtist?: string): { artist?: string; title: string } {
  const m = raw.match(SEPARATOR);
  if (!m || m.index === undefined) return { title: clean(raw) };
  const artist = raw.slice(0, m.index).trim();
  const title = clean(raw.slice(m.index + m[0].length));
  if (knownArtist !== undefined && normalize(artist) !== normalize(knownArtist)) return { title: clean(raw) };
  return { artist, title };
}

export function passesFilters(v: YtVideo, cfg: CurationConfig): { ok: true } | { ok: false; reason: string } {
  if (v.durationSeconds < MIN_SECONDS) return { ok: false, reason: 'too short' };
  if (v.durationSeconds >= MAX_SECONDS) return { ok: false, reason: 'too long' };
  if (!v.embeddable) return { ok: false, reason: 'not embeddable' };
  if (!v.public) return { ok: false, reason: 'not public' };
  if (v.views < cfg.minViews) return { ok: false, reason: 'too few views' };
  if (/- Topic$/.test(v.channelTitle)) return { ok: false, reason: 'Topic channel' };
  if (DENY.test(v.title)) return { ok: false, reason: 'denied title' };
  return { ok: true };
}
