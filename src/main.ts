import './style.css';
import {
  BACKGROUND,
  BASE_WIDTH,
  HAND_LOST_GRACE_MS,
  HOLD_CLEAR_MS,
  HOLD_SAVE_MS,
  HOLD_UNDO_MS,
  MAX_WIDTH,
  MIN_POINT_GAP,
  MIN_WIDTH,
  PALETTE,
  PINCH_OFF,
  SOURCE_URL,
} from './config.ts';
import { clamp, lerp, type Viewport } from './geometry.ts';
import { HoldTimer, StableGesture } from './gestures.ts';
import { assignRoles, otherSide, PinchDetector, pinchPoint, pinchRatio, toScreenHand } from './hands.ts';
import { InkLayer } from './ink.ts';
import { Overlay, type HoldRing } from './overlay.ts';
import { createTracker, type Tracker } from './tracker.ts';
import { LM, type DetectedHand, type Point, type ScreenHand, type Side } from './types.ts';
import { PointFilter } from './oneEuro.ts';
import { ColourWheel } from './wheel.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const LEGEND: [gesture: string, hand: string, action: string][] = [
  ['pinch', 'drawing hand', 'Draw. Loosen the pinch for a thicker line.'],
  ['peace sign', 'other hand', 'Open the colour wheel, then point at a colour.'],
  ['fist', 'other hand', 'Eraser, while you hold it.'],
  ['open palm', 'other hand', 'Hold to clear the canvas.'],
  ['thumbs up', 'other hand', 'Hold to save a PNG.'],
  ['thumbs down', 'other hand', 'Hold to undo.'],
];

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode etc. - not important */
    }
  },
};

class App {
  private video = $<HTMLVideoElement>('#video');
  private ink = new InkLayer($<HTMLCanvasElement>('#ink'));
  private overlay = new Overlay($<HTMLCanvasElement>('#overlay'));
  private tracker: Tracker | null = null;
  private trackerReady: Promise<Tracker>;

  // Settings
  private drawSide: Side = store.get('drawSide') === 'Left' ? 'Left' : 'Right';
  private colorIndex = 0;
  private baseWidth = BASE_WIDTH;
  private eraserLock = false;
  private showSkeleton = true;
  private showVideo = true;

  // Drawing hand
  private pinch = new PinchDetector();
  private nib = new PointFilter(1.4, 0.012);
  private widthSmooth = BASE_WIDTH;
  private cursor: Point | null = null;
  private lastDrawWrist: Point | null = null;
  private lastDrawSeen = 0;

  // Tool hand
  private toolGesture = new StableGesture();
  private toolNib = new PointFilter(1.0, 0.01);
  private toolTip: Point | null = null;
  private wheel = new ColourWheel(PALETTE.length);
  private wheelArmed = true;
  private holds = {
    clear: new HoldTimer(HOLD_CLEAR_MS),
    save: new HoldTimer(HOLD_SAVE_MS),
    undo: new HoldTimer(HOLD_UNDO_MS),
  };
  private ring: HoldRing | null = null;
  private fistErasing = false;

  // Frame state
  private hands: { hand: ScreenHand; role: 'draw' | 'tool' }[] = [];
  private lastVideoTime = -1;
  private running = false;
  private fpsFrames = 0;
  private fpsSince = performance.now();
  private toastTimer = 0;

  constructor() {
    this.trackerReady = createTracker();
    this.buildLegend();
    this.bindUi();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.updateToolHud();
    this.loadModel();
  }

  // ---------- setup ----------

  private buildLegend(): void {
    const html = LEGEND.map(
      ([g, h, a]) => `<li><span class="gesture">${g}<span class="hand">${h}</span></span><span>${a}</span></li>`,
    ).join('');
    document.querySelectorAll('[data-legend]').forEach((el) => (el.innerHTML = html));
    if (SOURCE_URL) {
      $('#source-link').innerHTML = ` · <a href="${SOURCE_URL}" target="_blank" rel="noopener">source</a>`;
    }
  }

  private async loadModel(): Promise<void> {
    const btn = $<HTMLButtonElement>('#start-btn');
    try {
      this.tracker = await this.trackerReady;
      btn.disabled = false;
      btn.textContent = 'start camera';
    } catch (err) {
      console.error(err);
      btn.textContent = 'model failed to load';
      this.showStartError('The hand model failed to load. Check your connection and refresh. You can still draw with a mouse.');
    }
  }

  private bindUi(): void {
    const segBtns = document.querySelectorAll<HTMLButtonElement>('[data-hand]');
    const syncSeg = () =>
      segBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.hand === this.drawSide)));
    segBtns.forEach((b) =>
      b.addEventListener('click', () => {
        this.setDrawSide(b.dataset.hand as Side);
        syncSeg();
      }),
    );
    syncSeg();

    $('#start-btn').addEventListener('click', () => this.startCamera());
    $('#mouse-btn').addEventListener('click', () => this.startMouse());

    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
      b.addEventListener('click', () => this.action(b.dataset.action!)),
    );

    window.addEventListener('keydown', (e) => this.onKey(e));
    this.bindMouse();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ink.resize(w, h, dpr);
    this.overlay.resize(w, h, dpr);
  }

  private async startCamera(): Promise<void> {
    const btn = $<HTMLButtonElement>('#start-btn');
    btn.disabled = true;
    btn.textContent = 'waiting for camera…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.hideStart(`${this.drawSide.toLowerCase()} hand draws · press ? for gestures`);
      this.setStatus(0);
      this.running = true;
      requestAnimationFrame((t) => this.loop(t));
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'try again';
      const name = (err as DOMException)?.name;
      this.showStartError(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in your browser’s site settings, then try again - or draw with a mouse.'
          : name === 'NotFoundError'
            ? 'No camera found. You can still draw with a mouse.'
            : 'Couldn’t start the camera. Make sure no other app is using it.',
      );
    }
  }

  private startMouse(): void {
    document.body.classList.add('mouse-mode', 'no-video');
    this.hideStart('click and drag to draw · 1-6 colours · E eraser');
    $('#status-text').textContent = 'mouse mode';
    const loop = () => {
      this.ink.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private hideStart(hint: string): void {
    $('#start').classList.add('hidden');
    this.toast(hint, 3200);
  }

  private showStartError(msg: string): void {
    const el = $('#start-error');
    el.textContent = msg;
    el.hidden = false;
  }

  private bindMouse(): void {
    const stage = $('#stage');
    let down = false;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.running) return;
      down = true;
      stage.setPointerCapture(e.pointerId);
      this.ink.begin(this.color, this.eraserLock, { x: e.clientX, y: e.clientY, w: this.baseWidth });
    });
    stage.addEventListener('pointermove', (e) => {
      if (down) this.ink.add({ x: e.clientX, y: e.clientY, w: this.baseWidth }, MIN_POINT_GAP);
    });
    const up = () => {
      if (!down) return;
      down = false;
      this.ink.end();
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  }

  // ---------- main loop ----------

  private loop(now: number): void {
    if (!this.running) return;
    const v = this.video;
    if (this.tracker && v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const detected = this.tracker.detect(v, now);
      this.update(detected, now);
      this.tickFps(now);
    }
    this.ink.render();
    this.overlay.render({
      hands: this.hands,
      showSkeleton: this.showSkeleton,
      cursor: this.cursor,
      drawing: this.ink.isDrawing,
      erasing: this.erasing,
      color: this.color,
      width: this.widthSmooth,
      toolTip: this.wheel.isOpen ? this.toolTip : null,
      wheel: this.wheel,
      ring: this.ring,
    });
    requestAnimationFrame((t) => this.loop(t));
  }

  /** Exposed for the test harness: feed hands straight in, skipping the camera. */
  update(detected: DetectedHand[], t: number): void {
    const vp: Viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      videoWidth: this.video.videoWidth || 1280,
      videoHeight: this.video.videoHeight || 720,
      mirrored: true,
    };
    const screen = detected.map((h) => toScreenHand(h, vp));
    const roles = assignRoles(screen, this.drawSide, this.lastDrawWrist);
    this.hands = [];
    if (roles.draw) this.hands.push({ hand: roles.draw, role: 'draw' });
    if (roles.tool) this.hands.push({ hand: roles.tool, role: 'tool' });
    this.setStatus(screen.length);

    this.updateTool(roles.tool, t);
    this.updateDraw(roles.draw, t);
  }

  private updateDraw(hand: ScreenHand | undefined, t: number): void {
    if (!hand) {
      if (t - this.lastDrawSeen > HAND_LOST_GRACE_MS) {
        this.ink.end();
        this.pinch.reset();
        this.nib.reset();
        this.cursor = null;
        this.lastDrawWrist = null;
      }
      return;
    }
    this.lastDrawSeen = t;
    this.lastDrawWrist = hand.pts[LM.WRIST];

    const ratio = pinchRatio(hand);
    const pinching = this.pinch.update(ratio);
    const p = this.nib.filter(pinchPoint(hand), t);
    this.cursor = p;

    // Looser pinch = thicker line. Smoothed so width doesn't wobble.
    const looseness = clamp(ratio / PINCH_OFF, 0, 1);
    const target = this.erasing ? this.baseWidth : this.baseWidth * lerp(0.6, 1.5, looseness);
    this.widthSmooth = lerp(this.widthSmooth, target, 0.2);

    if (pinching && !this.wheel.isOpen) {
      const pt = { x: p.x, y: p.y, w: this.widthSmooth };
      // Switching pen/eraser mid-stroke (fist made or released) splits the stroke.
      if (this.ink.isDrawing && this.ink.activeErase !== this.erasing) this.ink.end();
      if (!this.ink.isDrawing) this.ink.begin(this.color, this.erasing, pt);
      else this.ink.add(pt, MIN_POINT_GAP);
    } else {
      this.ink.end();
    }
  }

  private updateTool(hand: ScreenHand | undefined, t: number): void {
    const g = hand ? this.toolGesture.update(hand.gesture, hand.gestureScore, t) : this.toolGesture.reset();
    if (hand) this.toolTip = this.toolNib.filter(hand.pts[LM.INDEX_TIP], t);
    else {
      this.toolTip = null;
      this.toolNib.reset();
    }

    const wasErasing = this.erasing;
    this.fistErasing = g === 'Closed_Fist';
    if (this.erasing !== wasErasing) this.updateToolHud();

    // Colour wheel
    if (g !== 'Victory') this.wheelArmed = true;
    if (!this.wheel.isOpen && g === 'Victory' && this.wheelArmed && this.toolTip) {
      this.wheel.open(this.toolTip, t);
      this.wheelArmed = false;
    }
    if (this.wheel.isOpen) {
      const picked = this.wheel.update(this.toolTip, t);
      if (picked !== null) this.setColor(picked);
    }

    // Hold-to-confirm actions. Not while the wheel is open.
    const free = !this.wheel.isOpen;
    const palm = hand ? hand.pts[LM.MIDDLE_MCP] : null;
    this.ring = null;
    const holds: [HoldTimer, string, string, string, () => void][] = [
      [this.holds.clear, 'Open_Palm', 'clear', '#FF6B5B', () => this.action('clear')],
      [this.holds.save, 'Thumb_Up', 'save', '#4BE3AC', () => this.action('save')],
      [this.holds.undo, 'Thumb_Down', 'undo', '#FFB547', () => this.action('undo')],
    ];
    for (const [timer, gesture, label, color, fire] of holds) {
      if (timer.update(free && g === gesture, t)) fire();
      if (timer.progress > 0 && palm) this.ring = { at: palm, progress: timer.progress, label, color };
    }
  }

  // ---------- actions ----------

  private get color(): string {
    return PALETTE[this.colorIndex].value;
  }

  private get erasing(): boolean {
    return this.eraserLock || this.fistErasing;
  }

  private setColor(i: number): void {
    this.colorIndex = i;
    this.eraserLock = false;
    this.updateToolHud();
    this.toast(PALETTE[i].name.toLowerCase());
  }

  private setDrawSide(side: Side): void {
    this.drawSide = side;
    store.set('drawSide', side);
  }

  private action(name: string): void {
    switch (name) {
      case 'undo':
        this.toast(this.ink.undo() ? 'undo' : 'nothing to undo');
        break;
      case 'clear':
        if (this.ink.clear()) this.toast('cleared');
        break;
      case 'save':
        this.save();
        break;
      case 'help': {
        const help = $('#help');
        help.hidden = !help.hidden;
        break;
      }
    }
  }

  private save(): void {
    if (this.ink.strokeCount === 0) {
      this.toast('draw something first');
      return;
    }
    const canvas = this.ink.exportCanvas(BACKGROUND);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      a.download = `air-canvas-${stamp}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.toast('saved');
    }, 'image/png');
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault();
      this.action('undo');
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'z') this.action('undo');
    else if (k === 'c') this.action('clear');
    else if (k === 's') this.action('save');
    else if (k === '?' || k === '/') this.action('help');
    else if (k === 'escape') $('#help').hidden = true;
    else if (k === 'e') {
      this.eraserLock = !this.eraserLock;
      this.updateToolHud();
      this.toast(this.eraserLock ? 'eraser on' : 'eraser off');
    } else if (k >= '1' && k <= String(PALETTE.length)) this.setColor(Number(k) - 1);
    else if (k === '[' || k === ']') {
      this.baseWidth = clamp(this.baseWidth + (k === ']' ? 2 : -2), MIN_WIDTH, MAX_WIDTH);
      this.toast(`thickness ${this.baseWidth}`);
    } else if (k === 'h') {
      this.setDrawSide(otherSide(this.drawSide));
      this.toast(`${this.drawSide.toLowerCase()} hand draws`);
    } else if (k === 'k') this.showSkeleton = !this.showSkeleton;
    else if (k === 'v') {
      this.showVideo = !this.showVideo;
      document.body.classList.toggle('no-video', !this.showVideo);
    }
  }

  // ---------- HUD ----------

  private updateToolHud(): void {
    const sw = $('#swatch');
    sw.classList.toggle('eraser', this.erasing);
    sw.style.background = this.color;
    sw.style.color = this.color;
    $('#tool-name').textContent = this.erasing ? 'eraser' : `${PALETTE[this.colorIndex].name.toLowerCase()} pen`;
  }

  private lastHandCount = -1;
  private setStatus(n: number): void {
    if (n === this.lastHandCount) return;
    this.lastHandCount = n;
    $('#status').dataset.hands = String(n);
    $('#status-text').textContent = n === 0 ? 'show your hands' : n === 1 ? '1 hand' : '2 hands';
  }

  private tickFps(now: number): void {
    this.fpsFrames++;
    if (now - this.fpsSince >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsSince));
      $('#fps').textContent = `${fps} fps · ${this.tracker?.delegate.toLowerCase()}`;
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
  }

  private toast(msg: string, ms = 1400): void {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }
}

const app = new App();
// Handy for debugging in the console.
(window as unknown as { airCanvas: App }).airCanvas = app;
