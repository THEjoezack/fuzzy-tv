import type { CurationConfig } from './config';
import type { Lastfm } from './lastfm';

export interface ArtistNode {
  name: string;
  listeners: number;
  tags: string[];
  source: 'seed' | 'discovered';
}

/**
 * Breadth-first expansion from the seed artists through Last.fm "similar
 * artists". Seeds are always kept; discovered artists only when one of their
 * tags is in the genre allowlist. Only kept artists are expanded further.
 */
export async function expandArtists(cfg: CurationConfig, lastfm: Lastfm): Promise<ArtistNode[]> {
  const genres = new Set(cfg.genreTags.map((t) => t.toLowerCase()));
  const seen = new Set<string>();
  const nodes: ArtistNode[] = [];
  const key = (name: string) => name.trim().toLowerCase();

  let frontier: string[] = [];
  for (const seed of cfg.seedArtists) {
    if (seen.has(key(seed))) continue;
    seen.add(key(seed));
    const info = await lastfm.info(seed);
    nodes.push({ name: seed, listeners: info?.listeners ?? 0, tags: info?.tags ?? [], source: 'seed' });
    frontier.push(seed);
  }

  for (let depth = 0; depth < cfg.discoveryDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const artist of frontier) {
      for (const name of await lastfm.similar(artist, cfg.similarPerArtist)) {
        if (seen.has(key(name))) continue;
        seen.add(key(name));
        const info = await lastfm.info(name);
        if (!info || !info.tags.some((t) => genres.has(t.toLowerCase()))) continue;
        seen.add(key(info.name)); // autocorrect may canonicalize the name
        nodes.push({ name: info.name, listeners: info.listeners, tags: info.tags, source: 'discovered' });
        next.push(info.name);
      }
    }
    frontier = next;
  }
  return nodes;
}
