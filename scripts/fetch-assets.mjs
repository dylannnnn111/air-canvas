// Self-hosts the MediaPipe runtime and model so the app has no CDN dependency at runtime.
// - Copies the WASM runtime from node_modules into public/mediapipe/wasm
// - Downloads the Gesture Recognizer model into public/models (once)
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const wasmSrc = `${root}node_modules/@mediapipe/tasks-vision/wasm`;
const wasmDst = `${root}public/mediapipe/wasm`;
const modelDir = `${root}public/models`;
const modelPath = `${modelDir}/gesture_recognizer.task`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task';

const exists = (p) => stat(p).then(() => true, () => false);

if (!(await exists(wasmSrc))) {
  console.error('[assets] @mediapipe/tasks-vision not found. Run `npm install` first.');
  process.exit(1);
}
await mkdir(wasmDst, { recursive: true });
await cp(wasmSrc, wasmDst, { recursive: true });
console.log('[assets] MediaPipe WASM copied');

if (await exists(modelPath)) {
  console.log('[assets] Model already present');
} else {
  console.log('[assets] Downloading gesture recognizer model…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`[assets] Model download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  await mkdir(modelDir, { recursive: true });
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('[assets] Model saved');
}
