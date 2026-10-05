import { HANDEDNESS_INVERTED, PINCH_OFF, PINCH_ON } from './config.ts';
import { dist, mid, toScreen, type Viewport } from './geometry.ts';
import { LM, type DetectedHand, type Point, type ScreenHand, type Side } from './types.ts';

export const otherSide = (s: Side): Side => (s === 'Left' ? 'Right' : 'Left');

export function toScreenHand(h: DetectedHand, vp: Viewport): ScreenHand {
  const pts = h.landmarks.map((lm) => toScreen(lm, vp));
  return {
    ...h,
    pts,
    side: HANDEDNESS_INVERTED ? otherSide(h.label) : h.label,
    palm: Math.max(dist(pts[LM.WRIST], pts[LM.MIDDLE_MCP]), 1),
  };
}

export interface Roles {
  draw?: ScreenHand;
  tool?: ScreenHand;
}

/**
 * Decide which hand draws and which picks tools.
 * - Two hands: go by screen position (the view is mirrored, so your right hand is on the right).
 *   That's steadier than the handedness label, which can flicker.
 * - One hand: if it's where the drawing hand just was, keep it drawing. Otherwise trust the label.
 */
export function assignRoles(
  hands: ScreenHand[],
  drawSide: Side,
  lastDrawWrist: Point | null,
): Roles {
  if (hands.length === 0) return {};
  if (hands.length >= 2) {
    const [a, b] = [...hands].sort((p, q) => p.pts[LM.WRIST].x - q.pts[LM.WRIST].x);
    return drawSide === 'Right' ? { draw: b, tool: a } : { draw: a, tool: b };
  }
  const h = hands[0];
  if (lastDrawWrist && dist(h.pts[LM.WRIST], lastDrawWrist) < h.palm * 1.2) return { draw: h };
  return h.side === drawSide ? { draw: h } : { tool: h };
}

export function pinchRatio(h: ScreenHand): number {
  return dist(h.pts[LM.THUMB_TIP], h.pts[LM.INDEX_TIP]) / h.palm;
}

/** Where the "pen nib" is: between thumb and index tips, so it doesn't jump as you pinch. */
export function pinchPoint(h: ScreenHand): Point {
  return mid(h.pts[LM.THUMB_TIP], h.pts[LM.INDEX_TIP]);
}

/** Pinch on/off with hysteresis so it doesn't chatter at the threshold. */
export class PinchDetector {
  active = false;

  update(ratio: number): boolean {
    if (!this.active && ratio < PINCH_ON) this.active = true;
    else if (this.active && ratio > PINCH_OFF) this.active = false;
    return this.active;
  }

  reset(): void {
    this.active = false;
  }
}
