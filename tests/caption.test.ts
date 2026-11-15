// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { captionVisible, renderCaption } from '../src/caption';
import type { Video } from '../src/types';

describe('captionVisible', () => {
  test('start of video', () => expect(captionVisible(0, 300)).toBe(true));
  test('just inside the opening window', () => expect(captionVisible(7.9, 300)).toBe(true));
  test('opening window ends at 8s', () => expect(captionVisible(8, 300)).toBe(false));
  test('just before the closing window', () => expect(captionVisible(291, 300)).toBe(false));
  test('closing window starts 8s before the end', () => expect(captionVisible(292, 300)).toBe(true));
  test('short video overlaps both windows', () => expect(captionVisible(3, 10)).toBe(true));
});

describe('renderCaption', () => {
  const video: Video = { id: 'a', artist: 'SLIFT', title: 'The Day of Execution', durationSeconds: 314, source: 'seed' };

  test('artist, quoted title, no album line without an album', () => {
    const el = document.createElement('div');
    renderCaption(el, video, true);
    const lines = [...el.children].map((c) => c.textContent);
    expect(lines).toEqual(['SLIFT', '"The Day of Execution"']);
  });

  test('album line when present', () => {
    const el = document.createElement('div');
    renderCaption(el, { ...video, album: 'Ummon' }, true);
    expect(el.children).toHaveLength(3);
    expect(el.children[2].textContent).toBe('Ummon');
  });

  test('markup in data renders as literal text', () => {
    const el = document.createElement('div');
    renderCaption(el, { ...video, artist: '<b>x</b>' }, true);
    expect(el.querySelector('b')).not.toBeNull(); // the artist line is a <b> element...
    expect(el.querySelector('b')!.textContent).toBe('<b>x</b>'); // ...holding the literal string
    expect(el.querySelectorAll('b')).toHaveLength(1);
  });

  test('visibility toggles a class', () => {
    const el = document.createElement('div');
    renderCaption(el, video, false);
    expect(el.classList.contains('visible')).toBe(false);
    renderCaption(el, video, true);
    expect(el.classList.contains('visible')).toBe(true);
  });
});
