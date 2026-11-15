import { describe, expect, test } from 'vitest';
import { fallbackIndex, loadVideos, shouldSeek } from '../src/sync';
import type { Video } from '../src/types';

const validVideo: Video = { id: 'rdQyYsl_rDs', artist: 'King Gizzard & the Lizard Wizard', title: 'Alien Metal', durationSeconds: 308, source: 'seed' };

const respond = (body: string, status = 200): typeof fetch => async () => new Response(body, { status });

describe('shouldSeek', () => {
  test('within tolerance', () => expect(shouldSeek(100, 104)).toBe(false));
  test('behind by more than tolerance', () => expect(shouldSeek(100, 106)).toBe(true));
  test('ahead by more than tolerance', () => expect(shouldSeek(106, 100)).toBe(true));
});

describe('fallbackIndex', () => {
  test('advances', () => expect(fallbackIndex(0, 3)).toBe(1));
  test('wraps from last to first', () => expect(fallbackIndex(2, 3)).toBe(0));
});

describe('loadVideos', () => {
  test('404 → []', async () => expect(await loadVideos(respond('nope', 404))).toEqual([]));
  test('invalid JSON → []', async () => expect(await loadVideos(respond('not json'))).toEqual([]));
  test('missing videos array → []', async () => expect(await loadVideos(respond('{}'))).toEqual([]));
  test('drops invalid entries, keeps valid ones', async () => {
    const body = JSON.stringify({ videos: [validVideo, { id: 'x' }, { ...validVideo, id: 'y', durationSeconds: 0 }] });
    expect(await loadVideos(respond(body))).toEqual([validVideo]);
  });
  test('rejecting fetch → []', async () => {
    const failing: typeof fetch = async () => { throw new TypeError('network down'); };
    expect(await loadVideos(failing)).toEqual([]);
  });
});
