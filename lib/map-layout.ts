/** Pure helpers for the fullscreen map layout (sheet snap points, visual-viewport math, stored flags). No DOM access. */

export type SheetSnap = "collapsed" | "expanded";

/** Max height of a bottom sheet in dvh (spec: ~45dvh, never covering the key map area). */
export const SHEET_MAX_DVH = 45;
/** Height of the collapsed sheet (handle + title row), px. */
export const SHEET_COLLAPSED_PX = 64;
/** Drag distance (px) after which a sheet snaps to the other state; fast flicks (px/ms) snap earlier. */
export const SHEET_SNAP_DISTANCE = 48;
export const SHEET_FLICK_VELOCITY = 0.5;
export const SHEET_CLOSE_DISTANCE = 140;

/** Decide the snap point after a drag on the sheet handle. dy > 0 means dragged downwards. */
export function nextSheetSnap(current: SheetSnap, dy: number, velocity = 0): SheetSnap | "close" {
  const fast = Math.abs(velocity) >= SHEET_FLICK_VELOCITY;
  const down = dy > 0;
  const far = Math.abs(dy) >= SHEET_SNAP_DISTANCE || (fast && Math.abs(dy) >= 12);
  if (!far) return current;
  if (current === "expanded") return down ? "collapsed" : "expanded";
  return down ? (dy >= SHEET_CLOSE_DISTANCE ? "close" : "collapsed") : "expanded";
}

export type Rect = { top: number; bottom: number };
export type VisualViewportLike = { height: number; offsetTop: number };

/**
 * How far the on-screen keyboard (or iOS visual-viewport pan) cuts into the fullscreen stage.
 * `top`: px the stage top is above the visible area; `bottom`: px the stage bottom is below the visible area; `height`: visible height.
 */
export function viewportInsets(stage: Rect, vv: VisualViewportLike) {
  const visibleTop = vv.offsetTop;
  const visibleBottom = vv.offsetTop + vv.height;
  return {
    top: Math.max(0, Math.round(visibleTop - stage.top)),
    bottom: Math.max(0, Math.round(stage.bottom - visibleBottom)),
    height: Math.max(0, Math.round(vv.height)),
  };
}

/** Max height (px) a sheet may take: 45dvh of the visible viewport, but never more than what is visible above the keyboard minus a top margin. */
export function sheetMaxHeight(visibleHeight: number, stageHeight: number, topMargin = 72) {
  const cap = Math.round((Math.min(visibleHeight, stageHeight) * SHEET_MAX_DVH) / 100);
  const room = Math.max(SHEET_COLLAPSED_PX, Math.min(visibleHeight, stageHeight) - topMargin);
  return Math.max(SHEET_COLLAPSED_PX, Math.min(cap, room));
}

/** True when the box [a] overlaps more than `allowed` (0..1) of the area of [b]. */
export type Box = { left: number; top: number; right: number; bottom: number };
export function overlapRatio(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const area = (b.right - b.left) * (b.bottom - b.top);
  return area > 0 ? (w * h) / area : 0;
}

/** The centre region of the stage that collapsed overlays must keep free (middle 40% x 40%). */
export function centreRegion(width: number, height: number): Box {
  return { left: width * 0.3, top: height * 0.3, right: width * 0.7, bottom: height * 0.7 };
}

export const OVERLAY_KEY_PREFIX = "wendapply.map.overlay.";
export function parseStoredFlag(raw: string | null, fallback: boolean) {
  return raw === "1" ? true : raw === "0" ? false : fallback;
}
