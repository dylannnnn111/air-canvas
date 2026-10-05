/**
 * One Euro filter (Casiez et al., 2012).
 * Heavy smoothing when the hand is slow (kills jitter), light smoothing when it's fast (kills lag).
 */
class LowPass {
  private s: number | undefined;

  filter(x: number, alpha: number): number {
    this.s = this.s === undefined ? x : alpha * x + (1 - alpha) * this.s;
    return this.s;
  }

  reset(): void {
    this.s = undefined;
  }
}

const alpha = (dt: number, cutoff: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | undefined;
  private lastRaw = 0;

  /** Hz. Lower = smoother at rest. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag when moving fast. */
  beta: number;
  dCutoff: number;

  constructor(minCutoff = 1.4, beta = 0.012, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  /** @param t time in seconds */
  filter(value: number, t: number): number {
    if (this.lastT === undefined) {
      this.lastT = t;
      this.lastRaw = value;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(t - this.lastT, 1e-3);
    this.lastT = t;
    const speed = (value - this.lastRaw) / dt;
    this.lastRaw = value;
    const edx = this.dx.filter(speed, alpha(dt, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(dt, cutoff));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastT = undefined;
  }
}

export class PointFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(minCutoff?: number, beta?: number) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }

  filter(p: { x: number; y: number }, tMs: number) {
    return { x: this.fx.filter(p.x, tMs / 1000), y: this.fy.filter(p.y, tMs / 1000) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
