// DOM input for the map camera: pointer events (mouse, touch, pen), wheel / trackpad pinch and Safari gesture events.
// All maths lives in lib/map-camera.ts; this file only translates events into controller calls.
// Not a React hook on purpose: the 3D world lives outside React and is created once per mount.
import type { CameraController, GesturePoint } from "@/lib/map-camera";

/** Movement (px) before a press turns into a camera pan. Smaller than the tap threshold of the world (6 mouse / 12 touch). */
export const PAN_SLOP = { mouse: 4, touch: 6, pen: 5 } as const;

export type DragProbe = "none" | "pending" | "active";
export type CameraInputOptions = {
  host: HTMLElement;
  controller: CameraController;
  /** Item-drag arbitration: while a drag is pending for this pointer (long-press running) the camera waits; once armed it never pans. */
  dragState: (pointerId: number) => DragProbe;
  /** Called once the camera starts moving because of the user (pan/pinch/wheel). */
  onUserCamera?: () => void;
};

type Tracked = { id: number; type: keyof typeof PAN_SLOP; x: number; y: number; startX: number; startY: number; active: boolean; dead: boolean };

export function attachCameraInput({ host, controller, dragState, onUserCamera }: CameraInputOptions) {
  host.style.touchAction = "none";
  host.style.overscrollBehavior = "none";
  const pointers = new Map<number, Tracked>();
  /** Pointers whose press must not count as a tap: it stopped a glide or became a pan/pinch. Consumed by the world's pointerup. */
  const tapBlocked = new Set<number>();
  let rect = host.getBoundingClientRect();

  function refreshRect() { rect = host.getBoundingClientRect(); }
  function points(): GesturePoint[] {
    return [...pointers.values()].filter((p) => p.active).map((p) => ({ id: p.id, x: p.x - rect.left, y: p.y - rect.top }));
  }
  function push(time: number) { controller.gesture(points(), time); }

  function down(event: PointerEvent) {
    if (event.pointerType === "mouse" ? event.button !== 0 && event.button !== 1 : false) return;
    if (!pointers.size) refreshRect();
    const type = (event.pointerType === "mouse" || event.pointerType === "pen" ? event.pointerType : "touch") as Tracked["type"];
    tapBlocked.delete(event.pointerId);
    if (controller.gliding) tapBlocked.add(event.pointerId);
    if (controller.moving) controller.halt();
    pointers.set(event.pointerId, { id: event.pointerId, type, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: false, dead: false });
    // A second finger turns the gesture into pinch + pan right away (no slop), unless one of them belongs to an item drag.
    if (pointers.size >= 2) {
      let started = false;
      for (const p of pointers.values()) if (!p.active && !p.dead && dragState(p.id) === "none") { p.active = true; started = true; tapBlocked.add(p.id); capture(p.id); }
      if (started) { push(event.timeStamp); onUserCamera?.(); }
    }
  }

  function capture(id: number) { try { host.setPointerCapture(id); } catch { /* pointer already gone */ } }

  function move(event: PointerEvent) {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    p.x = event.clientX; p.y = event.clientY;
    if (p.dead) return;
    const drag = dragState(p.id);
    if (drag === "active") { p.dead = true; if (p.active) { p.active = false; push(event.timeStamp); } return; }
    if (drag === "pending") return; // long-press still running: the item drag may win
    if (!p.active) {
      if (Math.hypot(p.x - p.startX, p.y - p.startY) <= PAN_SLOP[p.type]) return;
      p.active = true; tapBlocked.add(p.id); capture(p.id); onUserCamera?.();
    }
    push(event.timeStamp);
  }

  function up(event: PointerEvent) {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    pointers.delete(event.pointerId);
    if (p.active) push(event.timeStamp);
    if (!pointers.size) controller.gesture([], event.timeStamp);
    try { if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  }

  function cancel(event: PointerEvent) {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    pointers.delete(event.pointerId);
    // A cancelled touch (system gesture, tab switch) must not fling.
    if (p.active) { if (pointers.size) push(event.timeStamp); else controller.cancelGesture(); }
  }

  function wheel(event: WheelEvent) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    refreshRect();
    // Trackpad pinch arrives as ctrl+wheel with small deltas; a mouse wheel notch is ~100 px.
    controller.wheel({ x: event.clientX - rect.left, y: event.clientY - rect.top }, event.deltaY * unit, event.ctrlKey);
    onUserCamera?.();
  }

  // Safari (macOS trackpad pinch, iOS) would zoom the whole page: keep it for the map.
  const stopGesture = (event: Event) => event.preventDefault();
  host.addEventListener("pointerdown", down);
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("wheel", wheel, { passive: false });
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) host.addEventListener(name, stopGesture, { passive: false });

  return {
    /** True once for a pointer whose press stopped a gliding map or turned into a camera pan/pinch: it must not select or place anything. */
    takeTapBlock(id: number) { return tapBlocked.delete(id); },
    refreshRect,
    dispose() {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", cancel);
      host.removeEventListener("wheel", wheel);
      for (const name of ["gesturestart", "gesturechange", "gestureend"]) host.removeEventListener(name, stopGesture);
      pointers.clear(); tapBlocked.clear();
    },
  };
}

export type CameraInput = ReturnType<typeof attachCameraInput>;
