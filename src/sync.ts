import type { Video } from './types';

/** True when the player has drifted further from the schedule than the tolerance. */
export function shouldSeek(actualSeconds: number, expectedSeconds: number, toleranceSeconds = 5): boolean {
  return Math.abs(actualSeconds - expectedSeconds) > toleranceSeconds;
}

/** The video to try when the current one can't play. */
export function fallbackIndex(current: number, length: number): number {
  return (current + 1) % length;
}

function isVideo(v: unknown): v is Video {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.durationSeconds === 'number' && Number.isFinite(o.durationSeconds) && o.durationSeconds > 0 &&
    typeof o.artist === 'string' &&
    typeof o.title === 'string'
  );
}

/** Loads the schedule. Any failure yields [] so the page can show the off-air card. */
export async function loadVideos(fetchFn: typeof fetch, url = '/videos.json'): Promise<Video[]> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const videos = (data as { videos?: unknown } | null)?.videos;
    return Array.isArray(videos) ? videos.filter(isVideo) : [];
  } catch {
    return [];
  }
}
