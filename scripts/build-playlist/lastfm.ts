const API = 'https://ws.audioscrobbler.com/2.0/';

// Last.fm's JSON turns one-item lists into a bare object.
const list = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function createLastfm(apiKey: string, fetchFn: typeof fetch) {
  /** Calls a Last.fm method. Returns null when Last.fm reports an error (unknown artist etc.). */
  async function call<T>(method: string, params: Record<string, string>): Promise<T | null> {
    const url = new URL(API);
    url.search = new URLSearchParams({ method, ...params, api_key: apiKey, format: 'json', autocorrect: '1' }).toString();
    const res = await fetchFn(url);
    const body = (await res.json().catch(() => undefined)) as (T & { error?: number }) | undefined;
    if (body && typeof body === 'object' && 'error' in body) return null;
    if (!res.ok || body === undefined) throw new Error(`Last.fm ${method} failed: HTTP ${res.status}`);
    return body;
  }

  return {
    async similar(artist: string, limit: number): Promise<string[]> {
      const r = await call<{ similarartists?: { artist?: { name: string } | { name: string }[] } }>('artist.getSimilar', {
        artist,
        limit: String(limit),
      });
      return list(r?.similarartists?.artist).map((a) => a.name);
    },

    async info(artist: string): Promise<{ name: string; listeners: number; tags: string[] } | null> {
      const r = await call<{
        artist?: { name: string; stats?: { listeners?: string }; tags?: { tag?: { name: string } | { name: string }[] } };
      }>('artist.getInfo', { artist });
      if (!r?.artist) return null;
      return {
        name: r.artist.name,
        listeners: Number(r.artist.stats?.listeners ?? 0) || 0,
        tags: list(r.artist.tags?.tag).map((t) => t.name.toLowerCase()),
      };
    },

    async album(artist: string, track: string): Promise<string | undefined> {
      const r = await call<{ track?: { album?: { title?: string } } }>('track.getInfo', { artist, track });
      return r?.track?.album?.title || undefined;
    },
  };
}

export type Lastfm = ReturnType<typeof createLastfm>;
