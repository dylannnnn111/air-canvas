import { GESTURE_MIN_SCORE, GESTURE_STABLE_MS } from './config.ts';

/** Only report a gesture once it's held steadily, so one noisy frame can't trigger anything. */
export class StableGesture {
  current = 'None';
  private candidate = 'None';
  private since = 0;

  update(name: string, score: number, t: number): string {
    const n = score >= GESTURE_MIN_SCORE ? name : 'None';
    if (n !== this.candidate) {
      this.candidate = n;
      this.since = t;
    }
    if (t - this.since >= GESTURE_STABLE_MS) this.current = this.candidate;
    return this.current;
  }

  reset(): string {
    this.current = this.candidate = 'None';
    return this.current;
  }
}

/** Hold-to-confirm. Fires once per hold; you have to let go before it can fire again. */
export class HoldTimer {
  private start: number | null = null;
  private fired = false;
  progress = 0;
  readonly duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }

  update(active: boolean, t: number): boolean {
    if (!active) {
      this.start = null;
      this.fired = false;
      this.progress = 0;
      return false;
    }
    if (this.start === null) this.start = t;
    if (this.fired) {
      this.progress = 0;
      return false;
    }
    this.progress = Math.min((t - this.start) / this.duration, 1);
    if (this.progress >= 1) {
      this.fired = true;
      this.progress = 0;
      return true;
    }
    return false;
  }
}
