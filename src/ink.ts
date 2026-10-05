import { ERASER_WIDTH } from './config.ts';
import { mid } from './geometry.ts';

export interface InkPoint {
  x: number;
  y: number;
  w: number;
}

export interface Stroke {
  color: string;
  erase: boolean;
  points: InkPoint[];
}

/** Smooth path through the points: quadratic curves via midpoints. */
function smoothPath(pts: InkPoint[]): Path2D {
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    path.lineTo(pts[0].x + 0.01, pts[0].y);
    return path;
  }
  path.lineTo(...xy(mid(pts[0], pts[1])));
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    path.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  const last = pts[pts.length - 1];
  path.lineTo(last.x, last.y);
  return path;
}

const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const pts = s.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.erase) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = ERASER_WIDTH;
    ctx.stroke(smoothPath(pts));
    ctx.restore();
    return;
  }

  const path = smoothPath(pts);
  const avg = pts.reduce((sum, p) => sum + p.w, 0) / pts.length;

  // 1. Soft neon glow
  ctx.strokeStyle = s.color;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = avg * 2.2;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = avg * 1.9;
  ctx.stroke(path);

  // 2. Solid core, width varies along the stroke (drawn per segment, opaque so overlaps don't show)
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  if (pts.length === 1) {
    ctx.lineWidth = pts[0].w;
    ctx.stroke(path);
  } else {
    const segs: [InkPoint, InkPoint | null, InkPoint, number][] = [];
    const m0 = { ...mid(pts[0], pts[1]), w: pts[0].w };
    segs.push([pts[0], null, m0, pts[0].w]);
    let prev = m0;
    for (let i = 1; i < pts.length - 1; i++) {
      const m = { ...mid(pts[i], pts[i + 1]), w: pts[i].w };
      segs.push([prev, pts[i], m, pts[i].w]);
      prev = m;
    }
    segs.push([prev, null, pts[pts.length - 1], pts[pts.length - 1].w]);
    for (const [a, c, b, w] of segs) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (c) ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      else ctx.lineTo(b.x, b.y);
      ctx.lineWidth = w;
      ctx.stroke();
    }
  }

  // 3. Hot white centre line
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(avg * 0.3, 1);
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Vector ink layer. Finished strokes are baked into an offscreen canvas; only the live stroke
 * is redrawn each frame. Strokes are kept as data so undo is just "drop the last one and rebake".
 */
export class InkLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private baked = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private active: Stroke | null = null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private dirty = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bctx = this.baked.getContext('2d')!;
  }

  get isDrawing(): boolean {
    return this.active !== null;
  }

  /** Mode of the stroke in progress, or null when not drawing. */
  get activeErase(): boolean | null {
    return this.active ? this.active.erase : null;
  }

  get strokeCount(): number {
    return this.strokes.length;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    for (const c of [this.canvas, this.baked]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.rebake();
  }

  begin(color: string, erase: boolean, p: InkPoint): void {
    this.active = { color, erase, points: [p] };
    this.dirty = true;
  }

  add(p: InkPoint, minGap: number): void {
    if (!this.active) return;
    const last = this.active.points[this.active.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < minGap) return;
    this.active.points.push(p);
    this.dirty = true;
  }

  end(): void {
    if (!this.active) return;
    this.strokes.push(this.active);
    this.bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawStroke(this.bctx, this.active);
    this.active = null;
    this.dirty = true;
  }

  undo(): boolean {
    if (this.active) {
      this.active = null;
      this.dirty = true;
      return true;
    }
    if (!this.strokes.pop()) return false;
    this.rebake();
    return true;
  }

  clear(): boolean {
    const had = this.strokes.length > 0 || this.active !== null;
    this.strokes = [];
    this.active = null;
    this.rebake();
    return had;
  }

  private rebake(): void {
    this.bctx.setTransform(1, 0, 0, 1, 0, 0);
    this.bctx.clearRect(0, 0, this.baked.width, this.baked.height);
    this.bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const s of this.strokes) drawStroke(this.bctx, s);
    this.dirty = true;
  }

  render(): void {
    if (!this.dirty) return;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.baked, 0, 0);
    if (this.active) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawStroke(ctx, this.active);
    }
    this.dirty = false;
  }

  /** Flatten onto a solid background for saving. */
  exportCanvas(background: string): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = this.baked.width;
    out.height = this.baked.height;
    const o = out.getContext('2d')!;
    o.fillStyle = background;
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(this.baked, 0, 0);
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    o.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
    o.fillStyle = 'rgba(244, 241, 234, 0.35)';
    o.textAlign = 'right';
    o.fillText('drawn in air canvas', this.w - 20, this.h - 20);
    return out;
  }
}
