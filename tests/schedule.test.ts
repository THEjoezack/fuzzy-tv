import { expect, test } from 'vitest';
import { secondsSinceMidnightET, whatsOn } from '../src/schedule';

const ten = Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, artist: `a${i}`, title: `t${i}`, durationSeconds: 360, source: 'seed' as const }));
const et = (iso: string) => new Date(iso); // ISO strings with explicit offsets

test('midnight ET is 0', () => expect(secondsSinceMidnightET(et('2026-11-16T00:00:00-05:00'))).toBe(0));
test('uses ET regardless of viewer zone', () => expect(secondsSinceMidnightET(et('2026-11-16T05:13:00Z'))).toBe(780));
test('spring-forward day stays in range', () => { const s = secondsSinceMidnightET(et('2026-03-08T07:30:00Z')); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(86400); });
test('fall-back day stays in range', () => { const s = secondsSinceMidnightET(et('2026-11-01T06:30:00Z')); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(86400); });
test('owner example: 12:13am → video #3, 60s in', () => {
  const r = whatsOn(ten, et('2026-11-16T00:13:00-05:00'))!;
  expect(r.index).toBe(2); expect(r.offsetSeconds).toBe(60); expect(r.remainingSeconds).toBe(300);
});
test('loops after total duration', () => expect(whatsOn(ten, et('2026-11-16T01:00:30-05:00'))!.index).toBe(0)); // 3630s mod 3600 = 30
test('boundary belongs to next video', () => expect(whatsOn(ten, et('2026-11-16T00:06:00-05:00'))!.index).toBe(1));
test('empty list → null', () => expect(whatsOn([], new Date())).toBeNull());
