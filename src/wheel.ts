import { WHEEL_DWELL_MS, WHEEL_INNER, WHEEL_RADIUS, WHEEL_TIMEOUT_MS } from './config.ts';
import type { Point } from './types.ts';

/** Radial colour picker. Opens at a point; move a fingertip into a segment and hold to pick. */
export class ColourWheel {
  center: Point | null = null;
  hovered = -1;
  dwell = 0;
  private hoverSince = 0;
  private lastActivity = 0;
  private readonly count: number;

  constructor(count: number) {
    this.count = count;
  }

  get isOpen(): boolean {
    return this.center !== null;
  }

  open(at: Point, t: number): void {
    this.center = { ...at };
    this.hovered = -1;
    this.dwell = 0;
    this.lastActivity = t;
  }

  close(): void {
    this.center = null;
    this.hovered = -1;
    this.dwell = 0;
  }

  /** Index of the segment under `p`, or -1. Segment 0 is at 12 o'clock, going clockwise. */
  segmentAt(p: Point): number {
    if (!this.center) return -1;
    const dx = p.x - this.center.x;
    const dy = p.y - this.center.y;
    const r = Math.hypot(dx, dy);
    if (r < WHEEL_INNER || r > WHEEL_RADIUS * 1.8) return -1;
    const seg = 360 / this.count;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const a = (deg + 90 + 360 + seg / 2) % 360;
    return Math.floor(a / seg) % this.count;
  }

  /** @returns the picked index, or null. Closes itself on pick or timeout. */
  update(pointer: Point | null, t: number): number | null {
    if (!this.center) return null;
    const idx = pointer ? this.segmentAt(pointer) : -1;
    if (idx !== this.hovered) {
      this.hovered = idx;
      this.hoverSince = t;
      this.lastActivity = t;
    }
    if (idx >= 0) {
      this.dwell = Math.min((t - this.hoverSince) / WHEEL_DWELL_MS, 1);
      if (this.dwell >= 1) {
        this.close();
        return idx;
      }
    } else {
      this.dwell = 0;
      if (t - this.lastActivity > WHEEL_TIMEOUT_MS) this.close();
    }
    return null;
  }
}
