// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { createPlayer } from '../src/player';

/** Fake YT.Player that records calls and becomes ready immediately. */
class FakeYtPlayer {
  static last: FakeYtPlayer;
  calls: string[] = [];
  constructor(_el: HTMLElement, opts: { events: { onReady(): void } }) {
    FakeYtPlayer.last = this;
    queueMicrotask(() => opts.events.onReady());
  }
  loadVideoById(o: { videoId: string; startSeconds: number }) { this.calls.push(`load ${o.videoId} ${o.startSeconds}`); }
  seekTo(s: number) { this.calls.push(`seek ${s}`); }
  playVideo() { this.calls.push('play'); }
  getCurrentTime() { return 0; }
}

test('seek also resumes playback, so a paused player recovers on resync', async () => {
  const pending = createPlayer(document.createElement('div'), { onEnded() {}, onError() {} });
  window.YT = { Player: FakeYtPlayer } as unknown as typeof window.YT;
  window.onYouTubeIframeAPIReady!();
  const tv = await pending;

  tv.seek(42);

  expect(FakeYtPlayer.last.calls).toEqual(['seek 42', 'play']);
});
