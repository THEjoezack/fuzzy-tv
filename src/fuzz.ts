// TV-static transition: a small canvas of random gray pixels, scaled up by CSS.

const W = 192;
const H = 108;
const FADE_MS = 200;

// A new burst replaces one already running on the same canvas.
const runs = new WeakMap<HTMLCanvasElement, number>();

export function playFuzz(canvas: HTMLCanvasElement, ms = 600): Promise<void> {
  const run = (runs.get(canvas) ?? 0) + 1;
  runs.set(canvas, run);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve();
  const frame = ctx.createImageData(W, H);

  canvas.style.transition = 'none';
  canvas.style.opacity = '1';

  return new Promise((resolve) => {
    const start = performance.now();
    const draw = (now: number) => {
      if (runs.get(canvas) !== run) return resolve();
      const px = frame.data;
      for (let i = 0; i < px.length; i += 4) {
        const v = (Math.random() * 256) | 0;
        px[i] = px[i + 1] = px[i + 2] = v;
        px[i + 3] = 255;
      }
      ctx.putImageData(frame, 0, 0);

      const elapsed = now - start;
      if (elapsed < ms - FADE_MS) {
        requestAnimationFrame(draw);
      } else if (canvas.style.opacity === '1') {
        canvas.style.transition = `opacity ${FADE_MS}ms ease-out`;
        canvas.style.opacity = '0';
        requestAnimationFrame(draw);
      } else if (elapsed < ms) {
        requestAnimationFrame(draw);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(draw);
  });
}
