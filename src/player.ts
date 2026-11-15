// Thin wrapper over the YouTube IFrame Player API.

interface YtPlayer {
  loadVideoById(opts: { videoId: string; startSeconds: number }): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
}

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: {
        onReady(): void;
        onStateChange(e: { data: number }): void;
        onError(e: { data: number }): void;
      };
    },
  ) => YtPlayer;
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface TvPlayer {
  load(id: string, startSeconds: number): void;
  seek(seconds: number): void;
  currentTime(): number;
}

const ENDED = 0;

let apiReady: Promise<YtNamespace> | undefined;

function loadApi(): Promise<YtNamespace> {
  apiReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
  return apiReady;
}

export async function createPlayer(
  el: HTMLElement,
  handlers: { onEnded(): void; onError(code: number): void },
): Promise<TvPlayer> {
  const YT = await loadApi();
  return new Promise((resolve) => {
    const yt = new YT.Player(el, {
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, disablekb: 1 },
      events: {
        onReady: () =>
          resolve({
            load: (id, startSeconds) => yt.loadVideoById({ videoId: id, startSeconds }),
            seek: (seconds) => yt.seekTo(seconds, true),
            currentTime: () => yt.getCurrentTime() ?? 0,
          }),
        onStateChange: (e) => {
          if (e.data === ENDED) handlers.onEnded();
        },
        onError: (e) => handlers.onError(e.data),
      },
    });
  });
}
