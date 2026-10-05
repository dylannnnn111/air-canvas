export const PALETTE = [
  { name: 'Coral', value: '#FF6B5B' },
  { name: 'Amber', value: '#FFB547' },
  { name: 'Mint', value: '#4BE3AC' },
  { name: 'Sky', value: '#4FC3FF' },
  { name: 'Lilac', value: '#B89CFF' },
  { name: 'Chalk', value: '#F4F1EA' },
] as const;

export const BACKGROUND = '#0B1530';

/** Shown as "source" on the start screen. Set to your GitHub repo URL. */
export const SOURCE_URL = '';

/** Pinch = thumb tip to index tip distance, divided by palm length (wrist to middle knuckle). */
export const PINCH_ON = 0.3;
export const PINCH_OFF = 0.45;

/** Drawing hand can drop out briefly (motion blur) without ending the stroke. */
export const HAND_LOST_GRACE_MS = 180;

export const GESTURE_MIN_SCORE = 0.55;
export const GESTURE_STABLE_MS = 140;

export const HOLD_CLEAR_MS = 1200;
export const HOLD_SAVE_MS = 900;
export const HOLD_UNDO_MS = 600;

export const WHEEL_RADIUS = 120;
export const WHEEL_INNER = 38;
export const WHEEL_DWELL_MS = 350;
export const WHEEL_TIMEOUT_MS = 3000;

export const BASE_WIDTH = 7;
export const MIN_WIDTH = 2;
export const MAX_WIDTH = 24;
export const ERASER_WIDTH = 46;

/** Skip points closer than this (px) to the previous one. */
export const MIN_POINT_GAP = 1.5;

/**
 * MediaPipe labels handedness assuming a mirrored (selfie) image.
 * We feed it the raw webcam frame, so the labels come out swapped.
 */
export const HANDEDNESS_INVERTED = true;
