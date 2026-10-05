import type { Landmark, Point } from './types.ts';

export interface Viewport {
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
  mirrored: boolean;
}

/** Map a normalised landmark onto a video shown with `object-fit: cover`, optionally mirrored. */
export function toScreen(lm: Landmark, vp: Viewport): Point {
  const s = Math.max(vp.width / vp.videoWidth, vp.height / vp.videoHeight);
  const dw = vp.videoWidth * s;
  const dh = vp.videoHeight * s;
  const x = lm.x * dw + (vp.width - dw) / 2;
  const y = lm.y * dh + (vp.height - dh) / 2;
  return { x: vp.mirrored ? vp.width - x : x, y };
}

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
