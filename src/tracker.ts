import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import type { DetectedHand, Side } from './types.ts';

const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}mediapipe/wasm`;
const MODEL_PATH = `${BASE}models/gesture_recognizer.task`;

export interface Tracker {
  detect(video: HTMLVideoElement, timestampMs: number): DetectedHand[];
  readonly delegate: 'GPU' | 'CPU';
}

/** Loads MediaPipe's Gesture Recognizer: 21 landmarks + handedness + gesture per hand, in one pass. */
export async function createTracker(): Promise<Tracker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  const make = (delegate: 'GPU' | 'CPU') =>
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

  let delegate: 'GPU' | 'CPU' = 'GPU';
  let recognizer: GestureRecognizer;
  try {
    recognizer = await make('GPU');
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    delegate = 'CPU';
    recognizer = await make('CPU');
  }

  return {
    delegate,
    detect(video, timestampMs) {
      const r = recognizer.recognizeForVideo(video, timestampMs);
      return r.landmarks.map((landmarks, i) => {
        const hand = r.handedness[i]?.[0];
        const gesture = r.gestures[i]?.[0];
        return {
          landmarks,
          label: (hand?.categoryName === 'Left' ? 'Left' : 'Right') as Side,
          gesture: gesture?.categoryName || 'None',
          gestureScore: gesture?.score ?? 0,
        };
      });
    },
  };
}
