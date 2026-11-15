import type { Video } from './types';

const etClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Seconds since midnight on the America/New_York wall clock, 0..86399. */
export function secondsSinceMidnightET(now: Date): number {
  const parts = etClock.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const s = get('hour') * 3600 + get('minute') * 60 + get('second');
  return Math.min(Math.max(s, 0), 86399);
}

export interface OnAir {
  index: number;
  video: Video;
  offsetSeconds: number;
  remainingSeconds: number;
}

/** What is playing right now: the playlist loops from midnight ET. */
export function whatsOn(videos: Video[], now: Date): OnAir | null {
  const total = videos.reduce((sum, v) => sum + v.durationSeconds, 0);
  if (videos.length === 0 || total <= 0) return null;

  let elapsed = secondsSinceMidnightET(now) % total;
  for (let index = 0; index < videos.length; index++) {
    const video = videos[index];
    if (elapsed < video.durationSeconds) {
      return { index, video, offsetSeconds: elapsed, remainingSeconds: video.durationSeconds - elapsed };
    }
    elapsed -= video.durationSeconds;
  }
  return null; // unreachable: elapsed < total
}
