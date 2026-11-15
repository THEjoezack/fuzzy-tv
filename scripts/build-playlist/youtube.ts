import { normalize } from './filters';

const API = 'https://www.googleapis.com/youtube/v3/';
const PAGE = 50;

export interface YtVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  durationSeconds: number;
  views: number;
  embeddable: boolean;
  public: boolean;
}

/** ISO 8601 duration (PT5M8S, P1DT2H, P0D) → seconds. */
export function parseIsoDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [d, h, min, s] = m.slice(1).map((n) => Number(n ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

interface VideoResource {
  id: string;
  snippet?: { title?: string; channelId?: string; channelTitle?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

export function createYoutube(apiKey: string, fetchFn: typeof fetch) {
  async function get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, API);
    url.search = new URLSearchParams({ ...params, key: apiKey }).toString();
    const res = await fetchFn(url);
    if (!res.ok) {
      // Never echo the URL: it carries the key.
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(`YouTube ${endpoint} failed: HTTP ${res.status}${body?.error?.message ? ` (${body.error.message})` : ''}`);
    }
    return (await res.json()) as T;
  }

  return {
    /** 100 quota units per call: callers wrap this in cached(). */
    async findArtistChannel(artist: string): Promise<{ channelId: string; title: string } | null> {
      const r = await get<{ items?: { id?: { channelId?: string }; snippet?: { title?: string } }[] }>('search', {
        part: 'snippet',
        type: 'channel',
        q: artist,
        maxResults: '5',
      });
      const wanted = new Set([normalize(artist), normalize(`${artist} official`)]);
      for (const item of r.items ?? []) {
        const title = item.snippet?.title ?? '';
        const channelId = item.id?.channelId;
        if (!channelId || /- Topic$/.test(title)) continue;
        if (wanted.has(normalize(title))) return { channelId, title };
      }
      return null;
    },

    async uploads(channelId: string, max = 50): Promise<YtVideo[]> {
      const ch = await get<{ items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>('channels', {
        part: 'contentDetails',
        id: channelId,
      });
      const playlistId = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!playlistId) return [];

      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await get<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>('playlistItems', {
          part: 'contentDetails',
          playlistId,
          maxResults: String(PAGE),
          ...(pageToken ? { pageToken } : {}),
        });
        for (const item of page.items ?? []) {
          const id = item.contentDetails?.videoId;
          if (id && ids.length < max) ids.push(id);
        }
        pageToken = page.nextPageToken;
      } while (pageToken && ids.length < max);

      const videos: YtVideo[] = [];
      for (let i = 0; i < ids.length; i += PAGE) {
        const r = await get<{ items?: VideoResource[] }>('videos', {
          part: 'contentDetails,statistics,status,snippet',
          id: ids.slice(i, i + PAGE).join(','),
          maxResults: String(PAGE),
        });
        for (const v of r.items ?? []) {
          videos.push({
            id: v.id,
            title: v.snippet?.title ?? '',
            channelId: v.snippet?.channelId ?? channelId,
            channelTitle: v.snippet?.channelTitle ?? '',
            durationSeconds: parseIsoDuration(v.contentDetails?.duration ?? ''),
            views: Number(v.statistics?.viewCount ?? 0) || 0,
            embeddable: v.status?.embeddable === true,
            public: v.status?.privacyStatus === 'public',
          });
        }
      }
      return videos;
    },
  };
}

export type Youtube = ReturnType<typeof createYoutube>;
