import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../scripts/build-playlist/config';
import { normalize, parseTitle, passesFilters } from '../../scripts/build-playlist/filters';
import type { YtVideo } from '../../scripts/build-playlist/youtube';

const cfg = loadConfig('curation/seeds.json');
const references: YtVideo[] = JSON.parse(readFileSync('tests/fixtures/youtube/reference-videos.json', 'utf8'));
const base = references[2]; // SLIFT - The Day of Execution

describe('normalize', () => {
  test('lowercases, & → and, drops a leading "the", strips punctuation', () => {
    expect(normalize('The Black Angels')).toBe('blackangels');
    expect(normalize('King Gizzard & the Lizard Wizard')).toBe('kinggizzardandthelizardwizard');
    expect(normalize('  Osees!  ')).toBe('osees');
  });
});

describe('parseTitle', () => {
  test('splits artist and strips an official/lyric suffix', () => {
    expect(parseTitle('SLIFT - The Day of Execution (Official Lyric Video)')).toEqual({ artist: 'SLIFT', title: 'The Day of Execution' });
  });
  test('strips a [Visualiser] suffix', () => {
    expect(parseTitle('King Gizzard & the Lizard Wizard - Alien Metal [Visualiser]').title).toBe('Alien Metal');
  });
  test('keeps a live-session suffix', () => {
    expect(parseTitle('Chelsea Wolfe - The Dark (Live on KEXP)').title).toBe('The Dark (Live on KEXP)');
  });
  test('splits on en and em dashes', () => {
    expect(parseTitle('SLIFT – Ummon')).toEqual({ artist: 'SLIFT', title: 'Ummon' });
    expect(parseTitle('SLIFT — Ummon')).toEqual({ artist: 'SLIFT', title: 'Ummon' });
  });
  test('splits only on the first separator', () => {
    expect(parseTitle('Osees - Animated Violence - Live')).toEqual({ artist: 'Osees', title: 'Animated Violence - Live' });
  });
  test('strips stacked suffixes and wrapping quotes', () => {
    expect(parseTitle('SLIFT - "Ummon" (Official Video) [4K]')).toEqual({ artist: 'SLIFT', title: 'Ummon' });
  });
  test('no separator → title only', () => {
    expect(parseTitle('Alien Metal (Official Audio)')).toEqual({ title: 'Alien Metal' });
  });
  test('known artist matches the left side', () => {
    expect(parseTitle('King Gizzard And The Lizard Wizard - Alien Metal', 'King Gizzard & the Lizard Wizard')).toEqual({
      artist: 'King Gizzard And The Lizard Wizard',
      title: 'Alien Metal',
    });
  });
  test('known artist that does not match → whole cleaned title, no artist', () => {
    expect(parseTitle('Ty Segall - Void (Official Video)', 'SLIFT')).toEqual({ title: 'Ty Segall - Void' });
  });
});

describe('passesFilters', () => {
  test.each(references.map((v) => [v.title, v]))('accepts reference video: %s', (_title, v) => {
    expect(passesFilters(v, cfg)).toEqual({ ok: true });
  });

  const rejects: [string, Partial<YtVideo>][] = [
    ['59 seconds', { durationSeconds: 59 }],
    ['600 seconds', { durationSeconds: 600 }],
    ['2 hours', { durationSeconds: 7200 }],
    ['not embeddable', { embeddable: false }],
    ['not public', { public: false }],
    ['1999 views', { views: 1999 }],
    ['Topic channel', { channelTitle: 'SLIFT - Topic' }],
    ['Full Set', { title: 'SLIFT - Full Set (Live at Levitation)' }],
    ['FULL ALBUM', { title: 'SLIFT - ILION FULL ALBUM' }],
    ['Reaction', { title: 'Reaction: SLIFT - Ummon' }],
    ['#shorts', { title: 'SLIFT live #shorts' }],
    ['Interview', { title: 'SLIFT Interview at Roadburn' }],
  ];
  test.each(rejects)('rejects %s with a reason', (_label, over) => {
    const r = passesFilters({ ...base, ...over }, cfg);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason.length > 0).toBe(true);
  });

  test('exactly 60s and 2000 views pass', () => {
    expect(passesFilters({ ...base, durationSeconds: 60, views: 2000 }, cfg)).toEqual({ ok: true });
  });
});
