import './style.css';
import { captionVisible, renderCaption } from './caption';
import { playFuzz } from './fuzz';
import { createPlayer, type TvPlayer } from './player';
import { whatsOn } from './schedule';
import { fallbackIndex, loadVideos, shouldSeek } from './sync';
import type { Video } from './types';

const RESYNC_MS = 30_000;
const CAPTION_MS = 1_000;

const $ = (id: string) => document.getElementById(id)!;

async function start(): Promise<void> {
  const videos = await loadVideos(fetch);
  if (videos.length === 0) {
    $('off-air').hidden = false;
    return;
  }

  const tuneIn = $('tune-in');
  tuneIn.hidden = false;
  tuneIn.addEventListener('click', () => {
    tuneIn.hidden = true;
    void tuneInTo(videos);
  }, { once: true });
}

async function tuneInTo(videos: Video[]): Promise<void> {
  const fuzz = $('fuzz') as HTMLCanvasElement;
  const caption = $('caption');
  let current = -1;
  // False while a fallback video plays: it runs from its start and the
  // schedule takes over again when it ends.
  let onSchedule = true;

  const load = (index: number, startSeconds: number) => {
    current = index;
    void playFuzz(fuzz);
    player.load(videos[index].id, startSeconds);
  };

  const playCurrent = () => {
    const on = whatsOn(videos, new Date())!;
    onSchedule = true;
    load(on.index, on.offsetSeconds);
  };

  const playFallback = () => {
    onSchedule = false;
    load(fallbackIndex(current, videos.length), 0);
  };

  void playFuzz(fuzz, 1_500); // covers the player while the API loads
  const player: TvPlayer = await createPlayer($('player'), {
    onEnded: playCurrent,
    onError: playFallback,
  });
  playCurrent();

  setInterval(() => {
    if (!onSchedule) return;
    const on = whatsOn(videos, new Date())!;
    if (on.index !== current) playCurrent();
    else if (shouldSeek(player.currentTime(), on.offsetSeconds)) player.seek(on.offsetSeconds);
  }, RESYNC_MS);

  setInterval(() => {
    const video = videos[current];
    renderCaption(caption, video, captionVisible(player.currentTime(), video.durationSeconds));
  }, CAPTION_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') playCurrent();
  });
}

void start();
