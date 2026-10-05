# Air Canvas

Draw in mid-air with your hands. One hand draws, the other picks colours, erases, saves and undoes - no mouse, no keyboard.

It tracks 21 points on each hand through your webcam in real time, entirely in the browser. No video leaves your device.

**[Try it live →](https://YOUR-USERNAME.github.io/air-canvas/)**

<!-- Add a demo GIF here: ![Air Canvas demo](docs/demo.gif) -->

## Gestures

| Gesture | Hand | Does |
| --- | --- | --- |
| Pinch (thumb + index) | Drawing hand | Draw. A looser pinch gives a thicker line. |
| Peace sign | Other hand | Opens a colour wheel at your fingertip. Point at a colour and hold. |
| Fist | Other hand | Eraser, while you hold it. |
| Open palm (hold) | Other hand | Clear the canvas. |
| Thumbs up (hold) | Other hand | Save a PNG. |
| Thumbs down (hold) | Other hand | Undo. |

The destructive actions are hold-to-confirm, with a ring that fills up, so a stray gesture can't wipe your drawing.

Keyboard: `Z` undo, `C` clear, `S` save, `E` eraser, `1`-`6` colours, `[` `]` thickness, `H` swap drawing hand, `K` skeleton, `V` camera feed, `?` help. No camera? You can draw with a mouse.

## How it works

- **Tracking** - MediaPipe's [Gesture Recognizer](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer) runs on the GPU via WebGL (CPU fallback). Each frame gives 21 landmarks, handedness and a gesture label per hand, in one pass.
- **Smoothing** - raw landmarks jitter a few pixels per frame, which is why most air-drawing demos look scratchy. The pen position runs through a [One Euro filter](https://gery.casiez.net/1euro/): heavy smoothing when you're slow, light when you're fast, so lines are clean without lagging.
- **Pinch detection** - the thumb-to-index distance is divided by palm size, so it works at any distance from the camera. Separate on/off thresholds (hysteresis) stop it flickering at the edge.
- **Two-hand roles** - with both hands up, roles go by screen position rather than the handedness label, which can flicker. With one hand, it stays the drawing hand if it's where the drawing hand just was.
- **Gesture debounce** - a gesture has to hold steady for ~140 ms before it counts, so a single misread frame never fires anything.
- **Rendering** - strokes are stored as vectors (that's what makes undo work), drawn as smoothed quadratic curves with variable width, and given a three-pass neon look: glow, core and a white highlight. Finished strokes are cached to an offscreen canvas, so only the live stroke is redrawn each frame.

```
src/
  main.ts       app controller: camera, loop, gesture → action
  tracker.ts    MediaPipe Gesture Recognizer wrapper
  hands.ts      screen mapping, hand roles, pinch detection
  gestures.ts   gesture debounce, hold-to-confirm timer
  oneEuro.ts    One Euro filter
  wheel.ts      radial colour picker
  ink.ts        vector stroke layer + PNG export
  overlay.ts    skeleton, cursors, wheel, hold rings
  config.ts     palette and tuning constants
```

## Run it locally

Needs Node 22.18+.

```bash
npm install
npm run dev
```

Open the URL Vite prints. The first run copies the MediaPipe WASM runtime out of `node_modules` and downloads the model (~8 MB) into `public/`, so everything is served from your own origin.

```bash
npm test        # unit tests for the filter, pinch, gestures, wheel and hand roles
npm run build   # type-check + production build into dist/
```

## Deploy

The repo includes a GitHub Actions workflow that tests, builds and publishes to GitHub Pages on every push to `main`. Turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Tips

- Front lighting helps a lot. Tracking gets shaky with a bright window behind you.
- Keep your hands roughly 40-80 cm from the camera.
- If the wrong hand is drawing, press `H` or change it on the start screen.

## Credits

Built by [Dylan Lewis](https://dylanlewis.au). Hand tracking by [MediaPipe](https://ai.google.dev/edge/mediapipe). MIT licence.
