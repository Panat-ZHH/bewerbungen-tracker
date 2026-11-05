// Camera maths and gesture state machine for the 3D map. No DOM, no three.js: everything here is unit tested
// (tests/map-camera.test.mjs). The renderer only copies `controller.state` into its OrthographicCamera.
//
// Model: a fixed isometric view (camera = target + CAMERA_OFFSET, always looking at the target on the ground plane y = 0),
// described by three numbers {x, z, zoom}. Screen <-> ground conversions are exact (orthographic projection = affine map).
import { ISLANDS, type Rect } from "./islands-config.ts";
import { islandArea } from "./islands.ts";

export type { Rect };
export type CameraState = { x: number; z: number; zoom: number };
export type Point = { x: number; z: number };
export type Pixel = { x: number; y: number };
export type View = { width: number; height: number };

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.4;
export const CAMERA_OFFSET = { x: 24, y: 30, z: 34 } as const;
/** Cells the camera target may rest outside the land (the water edge stays visible). */
export const BOUNDS_MARGIN = 3;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Frame-rate independent exponential approach: fraction of the remaining distance to cover in `dtMs` with time constant `tauMs`. */
export const dampFactor = (dtMs: number, tauMs: number) => (tauMs <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / tauMs));
export const clampZoom = (zoom: number) => (Number.isFinite(zoom) ? clamp(zoom, ZOOM_MIN, ZOOM_MAX) : 1);

// ---- view geometry -------------------------------------------------------------------------------------------------

/** Half size (world units at zoom 1) of the orthographic frustum for a viewport; matches the renderer's resize code. */
export function frustumHalf(width: number, height: number) {
  const vertical = width < 640 ? 10.5 : 9.5;
  return { hw: vertical * (height > 0 ? width / height : 1), hh: vertical };
}

const length = Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
const fwd = { x: -CAMERA_OFFSET.x / length, y: -CAMERA_OFFSET.y / length, z: -CAMERA_OFFSET.z / length };
const rightRaw = { x: -fwd.z, z: fwd.x };
const rightLength = Math.hypot(rightRaw.x, rightRaw.z);
const right = { x: rightRaw.x / rightLength, z: rightRaw.z / rightLength };
// camUp = right x forward (right has no y component)
const up = { x: -right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y };
// Ground offset (relative to the target) of the point at screen offset (a, b) in camera right/up units:
// G = M * (a, b). Derived from intersecting the view ray with y = 0.
const M = [
  [right.x, up.x - (up.y * fwd.x) / fwd.y],
  [right.z, up.z - (up.y * fwd.z) / fwd.y],
] as const;
const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];

/** Ground point (cells) under a pixel of a viewport, for a camera state. Pixels are relative to the viewport's top-left corner. */
export function screenToGround(camera: CameraState, view: View, pixel: Pixel): Point {
  const { hw, hh } = frustumHalf(view.width, view.height);
  const a = ((pixel.x / view.width) * 2 - 1) * hw / camera.zoom;
  const b = (1 - (pixel.y / view.height) * 2) * hh / camera.zoom;
  return { x: camera.x + M[0][0] * a + M[0][1] * b, z: camera.z + M[1][0] * a + M[1][1] * b };
}

/** Inverse of screenToGround. */
export function groundToScreen(camera: CameraState, view: View, point: Point): Pixel {
  const { hw, hh } = frustumHalf(view.width, view.height);
  const dx = point.x - camera.x, dz = point.z - camera.z;
  const a = (M[1][1] * dx - M[0][1] * dz) / det;
  const b = (-M[1][0] * dx + M[0][0] * dz) / det;
  return { x: ((a * camera.zoom) / hw + 1) / 2 * view.width, y: (1 - (b * camera.zoom) / hh) / 2 * view.height };
}

/** Camera (at `zoom`) that shows `world` exactly under `pixel`. */
export function anchorCamera(zoom: number, view: View, pixel: Pixel, world: Point): CameraState {
  const at = screenToGround({ x: 0, z: 0, zoom }, view, pixel);
  return { x: world.x - at.x, z: world.z - at.z, zoom };
}

/** Zoom to `zoom` while the ground point under `pixel` stays under `pixel`. */
export function zoomAbout(camera: CameraState, view: View, pixel: Pixel, zoom: number): CameraState {
  return anchorCamera(zoom, view, pixel, screenToGround(camera, view, pixel));
}

// ---- bounds --------------------------------------------------------------------------------------------------------

/** Land the camera may look at: every unlocked island plus its bridge (all connected). */
export function cameraRects(unlocked: number, firstIslandDepth = 20): Rect[] {
  const count = Number.isFinite(unlocked) ? Math.min(ISLANDS.length, Math.max(1, Math.floor(unlocked))) : 1;
  const rects: Rect[] = [];
  for (const island of ISLANDS) {
    if (island.no > count) continue;
    rects.push(islandArea(island, firstIslandDepth));
    if (island.bridge) rects.push(island.bridge);
  }
  return rects;
}

/** Closest point of the union of rects (expanded by margin) and the distance to it. */
export function nearestInRects(point: Point, rects: Rect[], margin = 0): { point: Point; distance: number } {
  if (!rects.length) return { point, distance: 0 };
  let best = { point, distance: Infinity };
  for (const rect of rects) {
    const candidate = { x: clamp(point.x, rect.x0 - margin, rect.x1 + margin), z: clamp(point.z, rect.z0 - margin, rect.z1 + margin) };
    const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
    if (distance < best.distance) best = { point: candidate, distance };
  }
  return best;
}

/** Rubber-band resistance: `over` px/cells beyond the edge are shown as less, approaching `limit` asymptotically (iOS style). */
export function rubberBand(over: number, limit: number, stiffness = 0.55) {
  if (over <= 0) return 0;
  return (1 - 1 / ((over * stiffness) / limit + 1)) * limit;
}

/** Target position for display during a gesture: inside the bounds as is, outside only a damped fraction of the overshoot. */
export function softConstrain(point: Point, rects: Rect[], margin = BOUNDS_MARGIN, limit = 6): Point {
  const near = nearestInRects(point, rects, margin);
  if (near.distance === 0) return point;
  const scale = rubberBand(near.distance, limit) / near.distance;
  return { x: near.point.x + (point.x - near.point.x) * scale, z: near.point.z + (point.z - near.point.z) * scale };
}

/** Zoom for display during a gesture: pinching beyond the limits resists (in log space so zoom in/out feel alike). */
export function softZoom(zoom: number, limit = 0.3) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  if (zoom > ZOOM_MAX) return ZOOM_MAX * Math.exp(rubberBand(Math.log(zoom / ZOOM_MAX), limit));
  if (zoom < ZOOM_MIN) return ZOOM_MIN / Math.exp(rubberBand(Math.log(ZOOM_MIN / zoom), limit));
  return zoom;
}

export function constrainState(state: CameraState, rects: Rect[], margin = BOUNDS_MARGIN): CameraState {
  const near = nearestInRects(state, rects, margin);
  return { x: near.point.x, z: near.point.z, zoom: clampZoom(state.zoom) };
}

// ---- inertia -------------------------------------------------------------------------------------------------------

export type Sample = { t: number; x: number; z: number };
export const INERTIA_TAU_MS = 320;
export const MAX_SPEED = 70; // cells per second
export const MIN_FLING_SPEED = 2.5; // cells per second

/** Release velocity (cells/s) from recent camera positions. A finger that rested before lifting (stale samples) gives 0. */
export function releaseVelocity(samples: Sample[], now: number, windowMs = 100, staleMs = 70): Point {
  const recent = samples.filter((sample) => now - sample.t <= windowMs);
  if (recent.length < 2) return { x: 0, z: 0 };
  const first = recent[0], last = recent[recent.length - 1];
  if (now - last.t > staleMs) return { x: 0, z: 0 };
  const dt = Math.max(16, last.t - first.t);
  let vx = ((last.x - first.x) / dt) * 1000, vz = ((last.z - first.z) / dt) * 1000;
  const speed = Math.hypot(vx, vz);
  if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vz *= MAX_SPEED / speed; }
  return speed < MIN_FLING_SPEED ? { x: 0, z: 0 } : { x: vx, z: vz };
}

/**
 * One inertia step: friction on the velocity, and a spring back (with a strongly damped velocity) when the camera
 * glided over the edge of the bounds. Returns whether the motion is finished.
 */
export function inertiaStep(position: Point, velocity: Point, dtMs: number, rects: Rect[], margin = BOUNDS_MARGIN) {
  const decay = Math.exp(-dtMs / INERTIA_TAU_MS);
  let vx = velocity.x * decay, vz = velocity.z * decay;
  // integral of v0*exp(-t/tau) over dt = v0*tau*(1-decay) (units: cells/s * s)
  let x = position.x + velocity.x * (INERTIA_TAU_MS / 1000) * (1 - decay);
  let z = position.z + velocity.z * (INERTIA_TAU_MS / 1000) * (1 - decay);
  const near = nearestInRects({ x, z }, rects, margin);
  if (near.distance > 0) {
    const pull = dampFactor(dtMs, 90);
    x += (near.point.x - x) * pull; z += (near.point.z - z) * pull;
    const keep = Math.exp(-dtMs / 60);
    vx *= keep; vz *= keep;
  }
  const done = Math.hypot(vx, vz) < 0.05 && near.distance < 0.01;
  return { position: { x, z }, velocity: done ? { x: 0, z: 0 } : { x: vx, z: vz }, done };
}

// ---- controller ----------------------------------------------------------------------------------------------------

export type GesturePoint = { id: number; x: number; y: number };
type Mode = "idle" | "gesture" | "inertia" | "ease" | "flight";

export type ControllerOptions = {
  view: View;
  rects: Rect[];
  /** Time constant of programmatic / wheel zoom easing. */
  easeTauMs?: number;
  /** Disable all easing and flights (prefers-reduced-motion): targets are reached immediately. */
  reducedMotion?: boolean;
};

/** Stateful camera: feed it gestures/wheel/commands and call `step()` once per frame; read `state`. */
export function createCameraController(initial: CameraState, options: ControllerOptions) {
  let view = options.view;
  let rects = options.rects;
  let reduced = options.reducedMotion ?? false;
  const easeTau = options.easeTauMs ?? 90;
  let state: CameraState = { ...initial };
  let goal: CameraState = { ...initial };
  let mode: Mode = "idle";
  let velocity: Point = { x: 0, z: 0 };
  let samples: Sample[] = [];
  // gesture bookkeeping
  let ids: number[] = [];
  let start: { world: Point; zoom: number; spread: number; mid: Pixel } | null = null;
  // wheel / programmatic zoom anchor: keeps `world` under `pixel` while zoom eases to goal.zoom
  let anchor: { pixel: Pixel; world: Point } | null = null;
  let flight: { from: Point; to: Point; startedAt: number; duration: number } | null = null;

  const mid = (points: GesturePoint[]): Pixel => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
  const spread = (points: GesturePoint[]) => (points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
  const viewCentre = (): Pixel => ({ x: view.width / 2, y: view.height / 2 });

  function rebase(points: GesturePoint[]) {
    const centre = mid(points);
    start = { world: screenToGround(state, view, centre), zoom: state.zoom, spread: spread(points), mid: centre };
    ids = points.map((p) => p.id).sort((a, b) => a - b);
  }

  function endGesture(now: number) {
    const hadMotion = samples.length > 1;
    const fling = hadMotion ? releaseVelocity(samples, now) : { x: 0, z: 0 };
    samples = []; start = null; ids = [];
    goal = { ...state };
    if (fling.x !== 0 || fling.z !== 0) { velocity = fling; mode = "inertia"; return; }
    settle();
  }

  /** After a gesture/command: if outside limits, ease back; otherwise idle. */
  function settle() {
    velocity = { x: 0, z: 0 };
    const constrained = constrainState(state, rects);
    const out = constrained.x !== state.x || constrained.z !== state.z || constrained.zoom !== state.zoom;
    if (out) { goal = constrained; mode = "ease"; } else { goal = { ...state }; mode = "idle"; }
  }

  return {
    get state(): CameraState { return state; },
    get goal(): CameraState { return goal; },
    get mode(): Mode { return mode; },
    /** True while the camera moves by itself or by a finger (the page uses this to ignore the tap that stops a glide). */
    get moving() { return mode !== "idle"; },
    get rects(): Rect[] { return rects; },
    get gliding() { return mode === "inertia"; },
    setView(next: View) { view = next; },
    setRects(next: Rect[]) { rects = next; if (mode === "idle") settle(); },
    setReducedMotion(value: boolean) { reduced = value; },
    /** Jump without animation. */
    set(next: Partial<CameraState>) {
      state = { x: next.x ?? state.x, z: next.z ?? state.z, zoom: clampZoom(next.zoom ?? state.zoom) };
      goal = { ...state }; mode = "idle"; velocity = { x: 0, z: 0 }; anchor = null; flight = null; start = null; ids = []; samples = [];
    },

    /**
     * Pointer state of the current gesture (all pointers that drive the camera, in viewport pixels).
     * 1 pointer = pan, 2 pointers = pan + pinch about the midpoint. Call with the full list on every move / down / up;
     * an empty list ends the gesture (and starts inertia). A change in the set of pointers re-anchors without a jump.
     */
    gesture(points: GesturePoint[], now: number) {
      const list = points.slice(0, 2);
      if (!list.length) { if (mode === "gesture") endGesture(now); return; }
      if (mode !== "gesture") { mode = "gesture"; anchor = null; flight = null; velocity = { x: 0, z: 0 }; samples = []; goal = { ...state }; rebase(list); return; }
      const key = list.map((p) => p.id).sort((a, b) => a - b);
      if (key.length !== ids.length || key.some((id, i) => id !== ids[i])) { samples = []; rebase(list); return; }
      const s = start!;
      const centre = mid(list);
      const rawZoom = s.spread > 8 && list.length > 1 ? s.zoom * (spread(list) / s.spread) : s.zoom;
      const zoom = softZoom(rawZoom);
      const raw = anchorCamera(zoom, view, centre, s.world);
      const soft = softConstrain(raw, rects);
      state = { x: soft.x, z: soft.z, zoom };
      goal = { ...state };
      samples.push({ t: now, x: state.x, z: state.z });
      if (samples.length > 12) samples.shift();
    },

    /** Mouse wheel. `delta` is in pixels (convert lines first). ctrlKey = trackpad pinch (finer steps). */
    wheel(pixel: Pixel, delta: number, ctrlKey: boolean) {
      if (mode === "gesture") return;
      if (mode === "inertia" || mode === "flight") { velocity = { x: 0, z: 0 }; flight = null; }
      const speed = ctrlKey ? 0.012 : 0.0016;
      const factor = Math.exp(clamp(-delta * speed, -0.6, 0.6));
      const next = clampZoom(goal.zoom * factor);
      if (!anchor || Math.hypot(anchor.pixel.x - pixel.x, anchor.pixel.y - pixel.y) > 3) anchor = { pixel, world: screenToGround(state, view, pixel) };
      goal = { ...goal, zoom: next };
      mode = "ease";
      if (reduced) { state = zoomAnchored(next); goal = { ...state }; anchor = null; settle(); }
    },

    /** Animated zoom to an absolute level, about the viewport centre (or `pixel`). */
    zoomTo(zoom: number, pixel?: Pixel) {
      if (mode === "gesture") return;
      velocity = { x: 0, z: 0 }; flight = null;
      const next = clampZoom(zoom);
      anchor = { pixel: pixel ?? viewCentre(), world: screenToGround(state, view, pixel ?? viewCentre()) };
      goal = { ...goal, zoom: next };
      mode = "ease";
      if (reduced) { state = zoomAnchored(next); goal = { ...state }; anchor = null; settle(); }
    },

    /** Animated move (and optionally zoom) to a ground point shown at the viewport centre. */
    focusOn(point: Point, zoom?: number) {
      if (mode === "gesture") return;
      anchor = null; velocity = { x: 0, z: 0 };
      const target = nearestInRects(point, rects, BOUNDS_MARGIN).point;
      goal = { x: target.x, z: target.z, zoom: zoom === undefined ? goal.zoom : clampZoom(zoom) };
      if (reduced) { state = { ...goal }; flight = null; mode = "idle"; return; }
      mode = "ease";
    },

    /** Slow cinematic flight (island switch): fixed duration with ease in/out, zoom untouched. */
    flyTo(point: Point, now: number, durationMs = 1500) {
      if (mode === "gesture") return;
      anchor = null; velocity = { x: 0, z: 0 };
      const target = nearestInRects(point, rects, BOUNDS_MARGIN).point;
      if (reduced) { state = { ...state, x: target.x, z: target.z }; goal = { ...state }; mode = "idle"; flight = null; return; }
      flight = { from: { x: state.x, z: state.z }, to: target, startedAt: now, duration: durationMs };
      goal = { ...state, x: target.x, z: target.z };
      mode = "flight";
    },

    /** The gesture was cancelled by the system (no fling): keep the view, ease back inside the bounds if needed. */
    cancelGesture() {
      if (mode !== "gesture") return;
      samples = []; start = null; ids = []; goal = { ...state };
      settle();
    },

    /** Stop any glide / easing right where the camera is (a finger touched the map). */
    halt() {
      if (mode === "gesture") return;
      velocity = { x: 0, z: 0 }; flight = null; anchor = null; goal = { ...state };
      settle();
    },

    /** Advance by `dtMs`. Returns true when `state` changed. */
    step(dtMs: number, now: number): boolean {
      const before = state;
      if (mode === "idle" || mode === "gesture") return false;
      if (mode === "inertia") {
        const next = inertiaStep(state, velocity, dtMs, rects);
        state = { ...state, x: next.position.x, z: next.position.z };
        velocity = next.velocity;
        goal = { ...state };
        if (next.done) { mode = "idle"; velocity = { x: 0, z: 0 }; }
      } else if (mode === "flight" && flight) {
        const t = clamp((now - flight.startedAt) / flight.duration, 0, 1);
        const e = easeInOutCubic(t);
        state = { ...state, x: lerp(flight.from.x, flight.to.x, e), z: lerp(flight.from.z, flight.to.z, e) };
        if (t >= 1) { flight = null; mode = "idle"; goal = { ...state }; }
      } else {
        const k = dampFactor(dtMs, easeTau);
        const zoom = Math.exp(lerp(Math.log(state.zoom), Math.log(goal.zoom), k));
        if (anchor) {
          const at = zoomAnchored(zoom);
          state = at; // position follows the anchor while zooming
          goal = { ...goal, x: state.x, z: state.z };
        } else {
          state = { x: lerp(state.x, goal.x, k), z: lerp(state.z, goal.z, k), zoom };
        }
        const zoomDone = Math.abs(Math.log(state.zoom / goal.zoom)) < 0.0015;
        const moveDone = Math.hypot(state.x - goal.x, state.z - goal.z) < 0.004;
        if (zoomDone && moveDone) {
          state = anchor ? zoomAnchored(goal.zoom) : { ...goal };
          anchor = null; goal = { ...state }; mode = "idle";
          // the anchored zoom may have left the bounds: ease back
          settle();
        }
      }
      return state.x !== before.x || state.z !== before.z || state.zoom !== before.zoom;
    },
  };

  /** Camera position keeping the anchor's ground point under its pixel at `zoom`. */
  function zoomAnchored(zoom: number): CameraState {
    const a = anchor!;
    return anchorCamera(zoom, view, a.pixel, a.world);
  }
}

export type CameraController = ReturnType<typeof createCameraController>;
