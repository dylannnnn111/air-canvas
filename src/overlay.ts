import { ERASER_WIDTH, PALETTE, WHEEL_INNER, WHEEL_RADIUS } from './config.ts';
import { HAND_CONNECTIONS, LM, type Point, type ScreenHand } from './types.ts';
import type { ColourWheel } from './wheel.ts';

export interface HoldRing {
  at: Point;
  progress: number;
  label: string;
  color: string;
}

export interface OverlayState {
  hands: { hand: ScreenHand; role: 'draw' | 'tool' }[];
  showSkeleton: boolean;
  cursor: Point | null;
  drawing: boolean;
  erasing: boolean;
  color: string;
  width: number;
  toolTip: Point | null;
  wheel: ColourWheel;
  ring: HoldRing | null;
}

const TAU = Math.PI * 2;
const TIPS = [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];

/** Everything that isn't ink: skeletons, cursors, colour wheel, hold-to-confirm rings. Redrawn every frame. */
export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  render(s: OverlayState): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    if (s.showSkeleton) {
      for (const { hand, role } of s.hands) this.skeleton(hand, role === 'draw' ? s.color : '#F4F1EA');
    }
    if (s.wheel.isOpen) this.wheel(s.wheel);
    if (s.toolTip) this.toolDot(s.toolTip);
    if (s.ring) this.ring(s.ring);
    if (s.cursor) this.cursor(s);
  }

  private skeleton(h: ScreenHand, color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(h.pts[a].x, h.pts[a].y);
      ctx.lineTo(h.pts[b].x, h.pts[b].y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    for (let i = 0; i < h.pts.length; i++) {
      const r = (TIPS as readonly number[]).includes(i) ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(h.pts[i].x, h.pts[i].y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private cursor(s: OverlayState): void {
    const { ctx } = this;
    const p = s.cursor!;
    ctx.save();
    if (s.erasing) {
      ctx.strokeStyle = '#F4F1EA';
      ctx.globalAlpha = s.drawing ? 0.9 : 0.6;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ERASER_WIDTH / 2, 0, TAU);
      ctx.stroke();
    } else {
      const r = Math.max(s.width * 0.9, 6);
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = s.drawing ? 18 : 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 8, 0, TAU);
      ctx.globalAlpha = s.drawing ? 0.9 : 0.55;
      ctx.stroke();
      if (s.drawing) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private toolDot(p: Point): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = '#F4F1EA';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private ring(r: HoldRing): void {
    const { ctx } = this;
    const R = 46;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(244, 241, 234, 0.18)';
    ctx.beginPath();
    ctx.arc(r.at.x, r.at.y, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = r.color;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(r.at.x, r.at.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * r.progress);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#F4F1EA';
    ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.label, r.at.x, r.at.y);
    ctx.restore();
  }

  private wheel(w: ColourWheel): void {
    const { ctx } = this;
    const c = w.center!;
    const n = PALETTE.length;
    const seg = TAU / n;
    const gap = 0.04;
    ctx.save();
    // Backdrop
    ctx.fillStyle = 'rgba(11, 21, 48, 0.55)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, WHEEL_RADIUS + 14, 0, TAU);
    ctx.fill();

    for (let i = 0; i < n; i++) {
      const start = -Math.PI / 2 + i * seg - seg / 2 + gap;
      const end = start + seg - gap * 2;
      const hot = i === w.hovered;
      const outer = hot ? WHEEL_RADIUS + 10 : WHEEL_RADIUS;
      ctx.beginPath();
      ctx.arc(c.x, c.y, outer, start, end);
      ctx.arc(c.x, c.y, WHEEL_INNER + 6, end, start, true);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i].value;
      ctx.globalAlpha = hot ? 1 : 0.75;
      ctx.shadowColor = PALETTE[i].value;
      ctx.shadowBlur = hot ? 24 : 0;
      ctx.fill();

      if (hot && w.dwell > 0) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#F4F1EA';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(c.x, c.y, outer + 10, start, start + (end - start) * w.dwell);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#F4F1EA';
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(w.hovered >= 0 ? PALETTE[w.hovered].name.toLowerCase() : 'point', c.x, c.y);
    ctx.restore();
  }
}
