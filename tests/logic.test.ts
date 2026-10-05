import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HoldTimer, StableGesture } from '../src/gestures.ts';
import { assignRoles, PinchDetector } from '../src/hands.ts';
import { OneEuroFilter } from '../src/oneEuro.ts';
import { toScreen } from '../src/geometry.ts';
import { ColourWheel } from '../src/wheel.ts';
import type { ScreenHand, Side } from '../src/types.ts';

test('one euro filter smooths jitter at rest', () => {
  const f = new OneEuroFilter();
  let maxDev = 0;
  for (let i = 0; i < 120; i++) {
    const noisy = 100 + (i % 2 ? 4 : -4);
    const out = f.filter(noisy, i / 30);
    if (i > 30) maxDev = Math.max(maxDev, Math.abs(out - 100));
  }
  assert.ok(maxDev < 2, `expected jitter < 2px, got ${maxDev}`);
});

test('one euro filter keeps up with fast movement', () => {
  const f = new OneEuroFilter();
  let out = 0;
  for (let i = 0; i <= 30; i++) out = f.filter(i * 40, i / 30); // 1200 px/s
  assert.ok(1200 - out < 60, `lag too high: ${1200 - out}px`);
});

test('pinch uses hysteresis', () => {
  const p = new PinchDetector();
  assert.equal(p.update(0.5), false);
  assert.equal(p.update(0.25), true);
  assert.equal(p.update(0.4), true, 'stays on between thresholds');
  assert.equal(p.update(0.5), false);
  assert.equal(p.update(0.4), false, 'stays off between thresholds');
});

test('stable gesture ignores single-frame noise', () => {
  const g = new StableGesture();
  assert.equal(g.update('Victory', 0.9, 0), 'None');
  assert.equal(g.update('Victory', 0.9, 50), 'None');
  assert.equal(g.update('Victory', 0.9, 200), 'Victory');
  assert.equal(g.update('Closed_Fist', 0.9, 230), 'Victory', 'one odd frame does not switch');
  assert.equal(g.update('Victory', 0.9, 260), 'Victory');
  assert.equal(g.update('Thumb_Up', 0.3, 300), 'Victory', 'low score counts as None, not yet stable');
});

test('hold timer fires once per hold', () => {
  const h = new HoldTimer(1000);
  assert.equal(h.update(true, 0), false);
  assert.equal(h.update(true, 500), false);
  assert.ok(Math.abs(h.progress - 0.5) < 1e-9);
  assert.equal(h.update(true, 1000), true);
  assert.equal(h.update(true, 3000), false, 'no repeat while still held');
  assert.equal(h.update(false, 3100), false);
  assert.equal(h.update(true, 3200), false);
  assert.equal(h.update(true, 4200), true, 'fires again after release');
});

test('colour wheel picks segment under pointer after dwell', () => {
  const w = new ColourWheel(6);
  w.open({ x: 0, y: 0 }, 0);
  assert.equal(w.segmentAt({ x: 0, y: -80 }), 0, '12 o’clock is 0');
  assert.equal(w.segmentAt({ x: 69.3, y: 40 }), 2, '4 o’clock is 2');
  assert.equal(w.segmentAt({ x: 0, y: 10 }), -1, 'centre is dead zone');
  assert.equal(w.update({ x: 0, y: 80 }, 100), null);
  assert.equal(w.update({ x: 0, y: 80 }, 500), 3, '6 o’clock is 3');
  assert.equal(w.isOpen, false);
});

test('colour wheel times out', () => {
  const w = new ColourWheel(6);
  w.open({ x: 0, y: 0 }, 0);
  w.update({ x: 0, y: 0 }, 1000);
  assert.equal(w.isOpen, true);
  w.update(null, 3500);
  assert.equal(w.isOpen, false);
});

test('toScreen mirrors and handles cover cropping', () => {
  const vp = { width: 1000, height: 1000, videoWidth: 1280, videoHeight: 720, mirrored: true };
  // Video scaled to 1777.8 x 1000, cropped equally both sides.
  const c = toScreen({ x: 0.5, y: 0.5, z: 0 }, vp);
  assert.ok(Math.abs(c.x - 500) < 1e-6 && Math.abs(c.y - 500) < 1e-6);
  const left = toScreen({ x: 0.4, y: 0, z: 0 }, vp);
  assert.ok(left.x > 500, 'left of raw frame appears right when mirrored');
});

const fakeHand = (wristX: number, side: Side): ScreenHand => ({
  landmarks: [],
  label: side,
  side,
  gesture: 'None',
  gestureScore: 0,
  palm: 100,
  pts: Array.from({ length: 21 }, () => ({ x: wristX, y: 500 })),
});

test('two hands: roles by screen position', () => {
  const a = fakeHand(200, 'Right'); // wrong label on purpose
  const b = fakeHand(800, 'Right');
  assert.equal(assignRoles([a, b], 'Right', null).draw, b);
  assert.equal(assignRoles([a, b], 'Left', null).draw, a);
});

test('one hand: stays the drawing hand if it is where the drawing hand was', () => {
  const h = fakeHand(500, 'Left');
  assert.equal(assignRoles([h], 'Right', { x: 520, y: 500 }).draw, h);
  assert.equal(assignRoles([h], 'Right', null).tool, h);
});
