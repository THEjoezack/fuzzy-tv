import { createPlayer, type TvPlayer } from './player';
import { whatsOn } from './schedule';
import { fallbackIndex, loadVideos, shouldSeek } from './sync';
import type { Video } from './types';

const RESYNC_MS = 30_000;

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
  let current = -1;
  // False while a fallback video plays: it runs from its start and the
  // schedule takes over again when it ends.
  let onSchedule = true;

  const playCurrent = () => {
    const on = whatsOn(videos, new Date())!;
    current = on.index;
    onSchedule = true;
    player.load(on.video.id, on.offsetSeconds);
  };

  const playFallback = () => {
    current = fallbackIndex(current, videos.length);
    onSchedule = false;
    player.load(videos[current].id, 0);
  };

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') playCurrent();
  });
}

void start();
