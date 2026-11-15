import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { createLastfm } from '../../scripts/build-playlist/lastfm';

const fixture = (name: string) => readFileSync(`tests/fixtures/lastfm/${name}.json`, 'utf8');

/** Fake fetch that answers with a fixture and records the requested URLs. */
function fakeFetch(body: string, status = 200) {
  const urls: URL[] = [];
  const fn: typeof fetch = async (input) => {
    urls.push(new URL(String(input)));
    return new Response(body, { status });
  };
  return { fn, urls };
}

describe('lastfm.similar', () => {
  test('returns similar artist names and sends the right query', async () => {
    const f = fakeFetch(fixture('getSimilar'));
    const names = await createLastfm('test-key', f.fn).similar('King Gizzard & the Lizard Wizard', 10);
    expect(names).toEqual(['Oh Sees', 'Ty Segall', 'Osees']);
    const q = f.urls[0].searchParams;
    expect(f.urls[0].origin + f.urls[0].pathname).toBe('https://ws.audioscrobbler.com/2.0/');
    expect(q.get('method')).toBe('artist.getSimilar');
    expect(q.get('artist')).toBe('King Gizzard & the Lizard Wizard');
    expect(q.get('limit')).toBe('10');
    expect(q.get('api_key')).toBe('test-key');
    expect(q.get('format')).toBe('json');
    expect(q.get('autocorrect')).toBe('1');
  });

  test('Last.fm error → []', async () => {
    expect(await createLastfm('test-key', fakeFetch(fixture('error')).fn).similar('Nobody', 10)).toEqual([]);
  });

  test('Last.fm error with an HTTP error status → []', async () => {
    expect(await createLastfm('test-key', fakeFetch(fixture('error'), 404).fn).similar('Nobody', 10)).toEqual([]);
  });

  test('server failure throws rather than looking like "no results"', async () => {
    await expect(createLastfm('test-key', fakeFetch('<html>oops</html>', 503).fn).similar('X', 10)).rejects.toThrow(/503/);
  });
});

describe('lastfm.info', () => {
  test('parses name, listeners, lowercased tags', async () => {
    const f = fakeFetch(fixture('getInfo'));
    expect(await createLastfm('test-key', f.fn).info('slift')).toEqual({
      name: 'SLIFT',
      listeners: 48213,
      tags: ['psychedelic rock', 'space rock', 'french'],
    });
    expect(f.urls[0].searchParams.get('method')).toBe('artist.getInfo');
  });

  test('a single tag object is treated as a one-item list', async () => {
    const info = await createLastfm('test-key', fakeFetch(fixture('getInfo-single-tag')).fn).info('Tiny Band');
    expect(info!.tags).toEqual(['noise rock']);
  });

  test('Last.fm error → null', async () => {
    expect(await createLastfm('test-key', fakeFetch(fixture('error')).fn).info('Nobody')).toBeNull();
  });
});

describe('lastfm.album', () => {
  test('returns the album title', async () => {
    const f = fakeFetch(fixture('trackInfo'));
    expect(await createLastfm('test-key', f.fn).album('SLIFT', 'The Day of Execution')).toBe('Ummon');
    const q = f.urls[0].searchParams;
    expect(q.get('method')).toBe('track.getInfo');
    expect(q.get('track')).toBe('The Day of Execution');
  });

  test('Last.fm error → undefined', async () => {
    expect(await createLastfm('test-key', fakeFetch(fixture('error')).fn).album('Nobody', 'Nothing')).toBeUndefined();
  });
});
