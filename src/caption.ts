import type { Video } from './types';

/** MTV-style: the caption shows for the opening and closing window of each video. */
export function captionVisible(offsetSeconds: number, durationSeconds: number, windowSeconds = 8): boolean {
  return offsetSeconds < windowSeconds || offsetSeconds >= durationSeconds - windowSeconds;
}

function line(tag: string, className: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/** Renders artist / "title" / album. Text only: video data never becomes markup. */
export function renderCaption(el: HTMLElement, video: Video, visible: boolean): void {
  if (el.dataset.videoId !== video.id) {
    el.dataset.videoId = video.id;
    const lines = [line('b', 'artist', video.artist), line('span', 'title', `"${video.title}"`)];
    if (video.album) lines.push(line('span', 'album', video.album));
    el.replaceChildren(...lines);
  }
  el.classList.toggle('visible', visible);
}
