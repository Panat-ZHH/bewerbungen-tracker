import type { DragApi } from "./map-drag.ts";

/** Drag API for the read-only friend island: disabled, and every method is a no-op that never reports a change. */
export const lockedDrag: DragApi = Object.freeze({
  enabled: false,
  move: () => undefined,
  reject: () => undefined,
  nudge: () => false,
  confirm: () => undefined,
  cancel: () => undefined,
  undo: () => undefined,
});

export const noopHandler = () => undefined;
