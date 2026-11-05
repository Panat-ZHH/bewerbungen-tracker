# Map interaction v2 (branch `map-interaction-v2`)

Pan, zoom, pinch, glide, bounds and item-drag arbitration of the 3D village map were rebuilt. This page lists the **public API** first, then root causes, the new design, the measurements (before / after) and what is left.

## API for the toolbar (Part C)

`ApplicationMapWorld` keeps all existing props (`zoom`, `center`, `onZoomChange`, `islandFocus`, ...). New and optional:

```tsx
import type { MapCameraApi } from "@/components/applications/application-map-world";

const camera = useRef<MapCameraApi | null>(null);
<ApplicationMapWorld ... onCameraApi={(api) => { camera.current = api; }} />

camera.current?.zoomIn();                 // +0.2, animated, about the view centre, clamped to 0.4 - 2.4
camera.current?.zoomOut();
camera.current?.setZoom(1.4);             // absolute
camera.current?.reset();                  // zoom 100 % + village centre
camera.current?.focusOn(x, z, zoom?);     // ground cell (world grid) to the view centre; clamped to the unlocked islands
camera.current?.getState();               // { x, z, zoom }
```

`onCameraApi(null)` is called when the 3D view is torn down. The old props keep working (they are what the current toolbar uses):

* `zoom` (controlled): a changed value animates the camera to that zoom about the view centre. The value the world reported last is recognised as an echo and ignored, so wheel / pinch / buttons cannot fight each other.
* `onZoomChange(zoom)`: called **throttled** (at most every 120 ms while moving, plus once when the camera has settled), rounded to 2 decimals. It used to be called on every frame.
* `center` (counter): glides to the village centre.
* `islandFocus`: cinematic 1.5 s flight (instant with `prefers-reduced-motion`).

Test hook (read only, used by `scripts/map-interaction-e2e.mjs`): the map host element (`role="region"`) has a non-enumerable `__map` property with `camera()`, `project(x,z)`, `ground(clientX, clientY)`, `house(id)`, `stats`, `pixelRatio()`.

## Files

| File | Role |
|---|---|
| `lib/map-camera.ts` | Pure maths + camera state machine (no DOM, no three.js): screen/ground conversion, zoom about a point, bounds, rubber band, inertia, `createCameraController` |
| `components/applications/map-camera-input.ts` | DOM side: pointer events, wheel, Safari gesture events, tap suppression, item-drag arbitration hook |
| `components/applications/application-map-world.tsx` | three.js setup, render loop, label projection (JSX untouched) |
| `lib/map-renderer.ts` | pixel-ratio cap + adaptive resolution policy, on-demand shadow refresh |
| `tests/map-camera.test.mjs`, `tests/map-renderer.test.mjs` | unit tests |
| `scripts/map-interaction-e2e.mjs` | real-input E2E (CDP touch / wheel / mouse) with frame statistics |

## Root causes found (old behaviour)

Method: `scripts/map-interaction-e2e.mjs` drives the real page (stubbed Supabase) with CDP input: `Input.dispatchTouchEvent` (1 and 2 fingers, with virtual timestamps), `Input.dispatchMouseEvent` type `mouseWheel` (plain and `ctrl` = trackpad pinch), mouse drags, and samples `requestAnimationFrame` deltas / long tasks. The "before" numbers come from an untouched copy of commit `2796dbe` plus the read-only test hook.

**Caveat on timings:** headless Chrome renders with SwiftShader (software GL) on a shared Mac that was running several other agents (load average 17-45), so absolute frame times (200-500 ms) are *not* what a phone or a GPU delivers. They are only comparable run-to-run in direction; the *counters* (React updates, scene rebuilds, accuracy in grid cells) are exact and are the real evidence.

| # | Root cause (old code) | Evidence (before) | After |
|---|---|---|---|
| 1 | `OrbitControls` zooms about the **view centre**, not the cursor / pinch midpoint | wheel zoom: point under the cursor drifts **6.07 cells**; pinch: midpoint drifts **2.85 cells**, two-finger pan off by **2.58 cells** | drift 0.01 / 0 / 0 cells (exact inverse of the projection, unit-tested against a real three.js camera) |
| 2 | No bounds at all: pan and zoom are free | after 16 sweeps the camera target was at x = 255, z = -103 (island 1 spans x -10..33) | target always inside the unlocked islands + bridges (+ 3 cell margin); rubber band while dragging, spring back on release; also for unlocked island 2-4 |
| 3 | `controls.addEventListener("change", ...)` calls `onZoomChange` -> `setZoom` of the **whole map page** on every camera change | 245 calls during one 60-move mouse pan, 166-170 during a 30-move pinch, 12 for 12 wheel ticks | 0 during pan, <= 1 per 120 ms while zooming (10-15 per burst even at 3 fps), exact value once settled |
| 4 | `populate()` depends on `placement`, and `setShop()` disposes and rebuilds **all** shop models on every call | placing: 8 clicks = **8 full scene rebuilds + 8 shop rebuilds** | 0 scene rebuilds, 0 shop rebuilds; only the ghost model is replaced (setShop still runs 8x) |
| 5 | Pointer listeners live on the canvas only, labels (`pointer-events:auto`, 96 px wide) swallow the gesture | a pan that starts on a building label moves the camera by **0** | input is bound to the host: a pan starting on a label pans (a tap on it still opens the dialog) |
| 6 | `OrbitControls` damping is per *call* (frame-rate dependent, 0.12 per frame); a new touch does not stop the glide; tiny glide | glide after a flick: 0.64 cells; touching the map during the glide: camera still moved 0.91 cells | time-based friction (tau 320 ms, frame-rate independent, tested at 60 and 120 Hz), glide 12.7 cells for the same flick; a touch stops it (0.003 cells) and that tap does not select / place anything |
| 7 | `OrbitControls` also **rotates** (right mouse, two-finger twist, `DOLLY_ROTATE`): a pinch twists the isometric view, everything feels "jumpy" and picking/label positions no longer match the game grid | by code (rotation is enabled in `touches.TWO` / `mouseButtons.RIGHT`) | fixed isometric camera; pinch = zoom + pan only |
| 8 | Render loop does DOM work every frame: `labels.querySelectorAll` and `host.clientWidth` **read after each label's style write** (forced layout per label per frame); `getBoundingClientRect` on every pointer move | by code | element list cached (MutationObserver), size cached (ResizeObserver), rect cached per gesture, labels only repositioned when the camera or scene changed |
| 9 | Shadow map re-rendered every frame (2048 px, PCF), pixel ratio up to 1.75, loop runs even when the map is scrolled off screen; tab-hidden pause only by the browser's rAF throttling | hidden tab: 5 frames rendered in 600 ms | shadows refreshed on demand (scene change, light moved > 3 cells, or every 120 ms), pixel ratio capped at 1.5 and adaptive (drops to 1 after 12 slow frames, recovers after 180 fast ones), loop paused when the tab is hidden **or** the map is off screen (IntersectionObserver): 0 frames while hidden; at rest the loop idles at ~30 fps |
| 10 | `touch-action: none` only on the `<canvas>` (CSS); host and labels still scroll the page | n/a (page did not scroll in the test, but labels/overlay are not covered) | `touch-action: none; overscroll-behavior: none` set on the host element by the input module; wheel registered `{ passive: false }` + `preventDefault` (also Safari `gesture*` events) |
| 11 | Item drag vs camera: `OrbitControls` already pans during the long-press wait and is only disabled when the drag arms | by code | explicit arbitration (see below); verified: held finger on a house = item drag and camera frozen; finger moved before 350 ms = pan and **no** drag |

## Frame statistics (software GL, see caveat)

Mean / p95 / max frame time in ms, `requestAnimationFrame` deltas during the gesture:

| Scenario | before (mean / p95 / max) | after (mean / p95 / max) |
|---|---|---|
| desktop 60-move mouse pan | 333 / 600 / 1500 (second run: 550 / 1483 / 3333) | 211 / 250 / 283 |
| desktop 12 wheel ticks | 479 / 750 / 850 | 178 / 250 / 600 |
| mobile 30-move pinch | 266 / 517 / 683 (first run: 500 / 1117 / 1450) | 136 / 200 / 383 |
| mobile 40-move one-finger pan | 307 / 800 / 1200 | 199 / 383 / 1483 (one outlier frame, shared machine) |

The improvement is mostly the skipped shadow pass and the removed per-frame React/DOM work; on a real GPU the absolute numbers are far smaller. Raw numbers: `screenshots/v2/map-interaction/*-stats.json`.

## New design

* **`lib/map-camera.ts`** (pure): the camera is `{x, z, zoom}` (target on the ground + zoom) with the fixed isometric offset (24, 30, 34). `screenToGround` / `groundToScreen` are exact (orthographic = affine) and unit-tested against a real `THREE.OrthographicCamera`. `zoomAbout`, `anchorCamera`, `cameraRects(unlocked, depth)` (all unlocked islands plus their bridges), `nearestInRects` (nearest point of an L-shaped union), `rubberBand`, `softConstrain` / `softZoom`, `releaseVelocity`, `inertiaStep`, `dampFactor`, `easeInOutCubic`.
* **`createCameraController`**: state machine `idle | gesture | inertia | ease | flight`. A *gesture* is computed **absolutely from the gesture start** (world point under the midpoint at start, finger spread at start) instead of accumulating deltas, so there is no drift and one finger lifting or landing re-anchors without a jump. Wheel zoom sets a goal zoom and eases (`tau` 90 ms, log space) while an *anchor* keeps the world point under the cursor fixed every frame. Programmatic moves (`zoomTo`, `focusOn`) ease, island switching is a 1.5 s cubic flight, all are instant with `prefers-reduced-motion`. Release velocity is taken from the last 100 ms of samples (a finger that rested before lifting does not fling), capped at 70 cells/s; glide has friction `tau` 320 ms and springs back at the bounds.
* **`map-camera-input.ts`**: Pointer Events on the host with `setPointerCapture` once a press turns into a gesture (slop 4 px mouse / 6 px touch, so taps and long-presses are not disturbed), two pointers = pinch + pan, wheel (`ctrlKey` = trackpad pinch, `deltaMode` normalised), Safari `gesture*` prevented. Presses that stop a glide or become a pan are *tap-blocked* so they never select or place something.
* **Item drag arbitration**: the input asks the world `dragState(pointerId)`: `pending` (long-press timer running; camera waits and starts panning only if the item drag was cancelled by movement > 10 px), `active` (the camera never moves for that pointer) or `none`. Mouse drags on an item stop propagation as before. A second finger cancels a pending drag and the two fingers pinch.
* **`application-map-world.tsx`**: three.js camera is only a copy of the controller state (`syncCamera`), render loop = `controller.step(dt)` -> shadows on demand -> render -> labels only if needed -> throttled zoom report. `populate()` now depends on `placement?.item.id` (start/end of a placement) instead of the whole placement; `setShop()` keeps its static models when inventory, layouts, selection and moving item are unchanged and only re-creates the ghost. Camera bounds follow `islandCount` and the village depth (`setRects`), so a freshly unlocked island is reachable before the flight starts.
* **Zoom prop echo**: the world remembers the zoom values it reported in the last 2 s and ignores them when they come back as the `zoom` prop, so toolbar buttons, wheel and pinch cannot fight each other (this was a real bug while developing: a stale echo pulled the camera back).

## Tests

* `tests/map-camera.test.mjs` (31 tests): conversions vs three.js, zoom-about anchoring, bounds incl. L-shaped union and all four islands, rubber band, release velocity, inertia (monotonic, glide distance = v*tau, frame-rate independence, edge spring), controller gestures (pan 1:1, pinch + pan, finger lift/land without jump, soft limits, fling, no fling after resting, cancel), wheel anchoring and clamping, `zoomTo`, `focusOn`, `flyTo`, reduced motion, commands ignored mid-gesture.
* `tests/map-renderer.test.mjs` (+3): pixel-ratio cap, adaptive resolution policy, shadow refresh policy.
* `scripts/map-interaction-e2e.mjs`: 47 real-input checks, **47/47 pass** on the final code (before: 22/33 on the first valid run; the rest of the old failures are the table above). Options: `ONLY=desktop|clamp|placement|arbitration|mobile`, `LABEL=...`, `SKIP_WHEEL=1`.
* Regression, run against the new code: `friend-island-e2e` (33 PASS, 0 FAIL, no console errors), `islands-e2e` (unlock + bridge + switcher, no console errors), `map-integration-e2e` desktop 15/15 and mobile 15/15; `npm test` 118/118, `npm run lint` 0 errors, `npx tsc --noEmit` clean.
* Screenshots: `~/Projects/bewerbungen-tracker-wt/screenshots/v2/map-interaction/` (`before*-` and `final-*`).

## Open items / notes

* Rotation of the view (right mouse / two-finger twist) was removed on purpose; the hint text next to the map never mentioned it.
* The test timings are software-rendered; please try a real iPhone: pan, pinch, flick, long-press on a house, scroll the page past the map.
* `MapCameraApi` is exposed but the current toolbar (`app/map/page.tsx`) still uses the `zoom` / `center` props; Part C can switch to `onCameraApi` without any change on our side.
* Keyboard: the arrow keys still nudge items (unchanged); there is no keyboard camera movement.
* Not done: edge auto-pan while dragging an item near the border of the view.

