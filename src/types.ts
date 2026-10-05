export interface Point {
  x: number;
  y: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Side = 'Left' | 'Right';

/** One hand as reported by the tracker, in normalised video coordinates. */
export interface DetectedHand {
  landmarks: Landmark[];
  /** Raw MediaPipe handedness label. */
  label: Side;
  /** Gesture Recognizer category, e.g. "Victory", "Closed_Fist", "None". */
  gesture: string;
  gestureScore: number;
}

/** A hand mapped into screen space. */
export interface ScreenHand extends DetectedHand {
  pts: Point[];
  /** The user's actual hand (label corrected for mirroring). */
  side: Side;
  /** Wrist to middle knuckle, in px. Used to normalise distances. */
  palm: number;
}

/** MediaPipe landmark indices we use. */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
} as const;

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
