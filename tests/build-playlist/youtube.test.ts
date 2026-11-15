import { describe, expect, test } from 'vitest';
import { createYoutube, parseIsoDuration } from '../../scripts/build-playlist/youtube';

type Route = (q: URLSearchParams) => unknown;

/** Fake fetch that routes by API endpoint and records every request. */
function fakeApi(routes: Record<string, Route>) {
  const calls: URL[] = [];
  const fn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const endpoint = url.pathname.replace('/youtube/v3/', '');
    const route = routes[endpoint];
    if (!route) return new Response(JSON.stringify({ error: { code: 404, message: 'no route' } }), { status: 404 });
    return new Response(JSON.stringify(route(url.searchParams)), { status: 200 });
  };
  return { fn, calls };
}

const video = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  snippet: { title: `Band - Song ${id}`, channelId: 'UCband', channelTitle: 'Band' },
  contentDetails: { duration: 'PT3M30S' },
  statistics: { viewCount: '12345' },
  status: { embeddable: true, privacyStatus: 'public' },
  ...over,
});

describe('parseIsoDuration', () => {
  test('minutes and seconds', () => expect(parseIsoDuration('PT5M8S')).toBe(308));
  test('hours and minutes', () => expect(parseIsoDuration('PT1H2M')).toBe(3720));
  test('zero', () => expect(parseIsoDuration('P0D')).toBe(0));
});

describe('uploads', () => {
  test('follows channel → uploads playlist → pages → video details', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `v${i}`);
    const api = fakeApi({
      channels: () => ({ items: [{ id: 'UCband', contentDetails: { relatedPlaylists: { uploads: 'UUband' } } }] }),
      playlistItems: (q) => {
        const page = q.get('pageToken') === 'p2' ? ids.slice(50) : ids.slice(0, 50);
        return { items: page.map((videoId) => ({ contentDetails: { videoId } })), ...(q.get('pageToken') ? {} : { nextPageToken: 'p2' }) };
      },
      videos: (q) => ({
        items: q.get('id')!.split(',').map((id) =>
          id === 'v1'
            ? video(id, { status: { embeddable: false, privacyStatus: 'unlisted' }, statistics: {}, contentDetails: { duration: 'PT1H' } })
            : video(id),
        ),
      }),
    });

    const vids = await createYoutube('test-key', api.fn).uploads('UCband', 60);

    expect(vids).toHaveLength(60);
    expect(vids[0]).toEqual({
      id: 'v0',
      title: 'Band - Song v0',
      channelId: 'UCband',
      channelTitle: 'Band',
      durationSeconds: 210,
      views: 12345,
      embeddable: true,
      public: true,
    });
    expect(vids[1]).toMatchObject({ embeddable: false, public: false, views: 0, durationSeconds: 3600 });

    const videoCalls = api.calls.filter((u) => u.pathname.endsWith('/videos'));
    expect(videoCalls.map((u) => u.searchParams.get('id')!.split(',').length)).toEqual([50, 10]);
    expect(videoCalls[0].searchParams.get('part')).toBe('contentDetails,statistics,status,snippet');
    expect(api.calls.every((u) => u.searchParams.get('key') === 'test-key')).toBe(true);
  });

  test('stops at max', async () => {
    const api = fakeApi({
      channels: () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUband' } } }] }),
      playlistItems: () => ({ items: ['a', 'b', 'c'].map((videoId) => ({ contentDetails: { videoId } })), nextPageToken: 'more' }),
      videos: (q) => ({ items: q.get('id')!.split(',').map((id) => video(id)) }),
    });
    const vids = await createYoutube('test-key', api.fn).uploads('UCband', 2);
    expect(vids.map((v) => v.id)).toEqual(['a', 'b']);
  });

  test('unknown channel → []', async () => {
    const api = fakeApi({ channels: () => ({ items: [] }) });
    expect(await createYoutube('test-key', api.fn).uploads('UCnope')).toEqual([]);
  });

  test('a channel with no uploads playlist (404 playlistNotFound) → []', async () => {
    // Official Artist Channels whose videos all live on other channels have no uploads playlist.
    const api = fakeApi({
      channels: () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUempty' } } }] }),
    });
    expect(await createYoutube('test-key', api.fn).uploads('UCempty')).toEqual([]);
  });

  test('API errors throw without leaking the key', async () => {
    const api = fakeApi({});
    const err = await createYoutube('test-key', api.fn).uploads('UCband').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/404/);
    expect((err as Error).message).not.toContain('test-key');
  });
});

describe('findArtistChannel', () => {
  const result = (channelId: string, title: string) => ({ id: { kind: 'youtube#channel', channelId }, snippet: { title, channelId } });

  test('skips a "- Topic" channel and picks the matching one', async () => {
    const api = fakeApi({
      search: () => ({ items: [result('UCtopic', 'SLIFT - Topic'), result('UCother', 'Slift Fan Club'), result('UCslift', 'SLIFT')] }),
    });
    expect(await createYoutube('test-key', api.fn).findArtistChannel('SLIFT')).toEqual({ channelId: 'UCslift', title: 'SLIFT' });
    const q = api.calls[0].searchParams;
    expect(q.get('type')).toBe('channel');
    expect(q.get('q')).toBe('SLIFT');
    expect(q.get('maxResults')).toBe('5');
  });

  test('accepts "<artist> Official"', async () => {
    const api = fakeApi({ search: () => ({ items: [result('UCcw', 'Chelsea Wolfe Official')] }) });
    expect(await createYoutube('test-key', api.fn).findArtistChannel('Chelsea Wolfe')).toEqual({ channelId: 'UCcw', title: 'Chelsea Wolfe Official' });
  });

  test('no match → null', async () => {
    const api = fakeApi({ search: () => ({ items: [result('UCx', 'Somebody Else')] }) });
    expect(await createYoutube('test-key', api.fn).findArtistChannel('SLIFT')).toBeNull();
  });
});
