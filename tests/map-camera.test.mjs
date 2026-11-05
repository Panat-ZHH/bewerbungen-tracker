import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  BOUNDS_MARGIN, CAMERA_OFFSET, ZOOM_MAX, ZOOM_MIN, anchorCamera, cameraRects, clamp, clampZoom, constrainState, createCameraController, dampFactor,
  easeInOutCubic, frustumHalf, groundToScreen, inertiaStep, lerp, nearestInRects, releaseVelocity, rubberBand, screenToGround, softConstrain, softZoom, zoomAbout,
} from "../lib/map-camera.ts";
import { ISLANDS } from "../lib/islands-config.ts";

const view = { width: 900, height: 600 };
const phone = { width: 390, height: 640 };
const close = (a, b, eps = 1e-6, message) => assert.ok(Math.abs(a - b) <= eps, `${message ?? ""} ${a} !~ ${b}`);
const rects1 = cameraRects(1);
const all = cameraRects(4);

test("clamp, lerp, easing and damping basics", () => {
  assert.equal(clamp(5, 0, 3), 3); assert.equal(clamp(-1, 0, 3), 0); assert.equal(clamp(2, 0, 3), 2);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1); assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(easeInOutCubic(0.25) < 0.25 && easeInOutCubic(0.75) > 0.75, "slow start, slow end");
  assert.equal(dampFactor(16, 0), 1); assert.equal(dampFactor(0, 100), 0);
  // frame-rate independent: two 8 ms steps == one 16 ms step
  close(1 - (1 - dampFactor(8, 90)) ** 2, dampFactor(16, 90), 1e-12);
  assert.equal(clampZoom(99), ZOOM_MAX); assert.equal(clampZoom(0.01), ZOOM_MIN); assert.equal(clampZoom(NaN), 1);
});

test("screen <-> ground conversion is an exact inverse and the centre maps to the camera target", () => {
  for (const v of [view, phone]) for (const zoom of [0.4, 1, 2.4]) {
    const cam = { x: 12.5, z: -3, zoom };
    const centre = screenToGround(cam, v, { x: v.width / 2, y: v.height / 2 });
    close(centre.x, cam.x); close(centre.z, cam.z);
    for (const pixel of [{ x: 0, y: 0 }, { x: v.width, y: v.height }, { x: 33, y: 401 }]) {
      const back = groundToScreen(cam, v, screenToGround(cam, v, pixel));
      close(back.x, pixel.x, 1e-6); close(back.y, pixel.y, 1e-6);
    }
  }
});

test("conversion matches a real three.js OrthographicCamera at the game's isometric angle", () => {
  for (const [v, zoom, target] of [[view, 1, { x: 3, z: 4 }], [phone, 1.7, { x: -5, z: 9 }], [view, 0.5, { x: 40, z: 30 }]]) {
    const { hw, hh } = frustumHalf(v.width, v.height);
    const camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 200);
    camera.zoom = zoom;
    camera.position.set(target.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, target.z + CAMERA_OFFSET.z);
    camera.lookAt(target.x, 0, target.z);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    for (const pixel of [{ x: 0, y: 0 }, { x: v.width * 0.7, y: v.height * 0.2 }, { x: v.width / 2, y: v.height / 2 }]) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(pixel.x / v.width * 2 - 1, -(pixel.y / v.height) * 2 + 1), camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      const mine = screenToGround({ ...target, zoom }, v, pixel);
      close(mine.x, hit.x, 1e-4, "x"); close(mine.z, hit.z, 1e-4, "z");
      const projected = new THREE.Vector3(hit.x, 0, hit.z).project(camera);
      const back = groundToScreen({ ...target, zoom }, v, hit);
      close(back.x, (projected.x + 1) / 2 * v.width, 1e-3); close(back.y, (1 - projected.y) / 2 * v.height, 1e-3);
    }
  }
});

test("zoomAbout keeps the point under the cursor fixed for any zoom step", () => {
  const cam = { x: 4, z: 6, zoom: 1 };
  for (const pixel of [{ x: 10, y: 10 }, { x: 700, y: 120 }, { x: 450, y: 300 }]) {
    const before = screenToGround(cam, view, pixel);
    for (const zoom of [0.4, 0.8, 1.9, 2.4]) {
      const next = zoomAbout(cam, view, pixel, zoom);
      assert.equal(next.zoom, zoom);
      const after = screenToGround(next, view, pixel);
      close(after.x, before.x); close(after.z, before.z);
    }
  }
  // zoom in then out about the same pixel returns to the start
  const there = zoomAbout(cam, view, { x: 700, y: 120 }, 2);
  const back = zoomAbout(there, view, { x: 700, y: 120 }, 1);
  close(back.x, cam.x); close(back.z, cam.z);
});

test("anchorCamera places a world point under any pixel", () => {
  const world = { x: 20, z: 5 };
  const cam = anchorCamera(1.3, phone, { x: 100, y: 500 }, world);
  const at = screenToGround(cam, phone, { x: 100, y: 500 });
  close(at.x, world.x); close(at.z, world.z);
});

test("camera rects cover unlocked islands and their bridges, all connected", () => {
  assert.equal(rects1.length, 1);
  assert.deepEqual(cameraRects(2).length, 3);
  assert.equal(all.length, 7);
  assert.deepEqual(cameraRects(0), rects1, "invalid counts fall back to the first island");
  assert.deepEqual(cameraRects(NaN), rects1);
  assert.equal(cameraRects(1, 30)[0].z1, 30, "first island grows with the village depth");
  // connectivity: every later island is reachable via its bridge touching both areas
  const [i1, i2, b2] = cameraRects(2);
  assert.ok(b2.x0 <= i1.x1 && b2.x1 >= i2.x0);
});

test("nearestInRects: inside is unchanged, outside snaps to the closest rect (L-shaped union works)", () => {
  const rects = [{ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 20, z0: 0, x1: 30, z1: 10 }];
  assert.deepEqual(nearestInRects({ x: 5, z: 5 }, rects), { point: { x: 5, z: 5 }, distance: 0 });
  assert.deepEqual(nearestInRects({ x: 12, z: 5 }, rects).point, { x: 10, z: 5 }, "closer to the left rect");
  assert.deepEqual(nearestInRects({ x: 18, z: 5 }, rects).point, { x: 20, z: 5 }, "closer to the right rect");
  assert.deepEqual(nearestInRects({ x: 15, z: 50 }, rects).point.z, 10);
  assert.deepEqual(nearestInRects({ x: 11, z: 5 }, rects, 2).distance, 0, "margin extends the land");
  assert.deepEqual(nearestInRects({ x: 1, z: 1 }, []), { point: { x: 1, z: 1 }, distance: 0 });
});

test("rubber band resists increasingly and never exceeds its limit", () => {
  assert.equal(rubberBand(0, 6), 0); assert.equal(rubberBand(-3, 6), 0);
  const samples = [1, 5, 20, 100, 1e6].map((over) => rubberBand(over, 6));
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] > samples[i - 1]);
  assert.ok(samples.every((value) => value < 6));
  assert.ok(rubberBand(1, 6) < 1, "less than 1:1");
});

test("softConstrain: free inside, damped outside; softZoom damps beyond the limits", () => {
  assert.deepEqual(softConstrain({ x: 5, z: 5 }, rects1), { x: 5, z: 5 });
  const edge = rects1[0].x1 + BOUNDS_MARGIN;
  const out = softConstrain({ x: edge + 20, z: 5 }, rects1);
  assert.ok(out.x > edge && out.x < edge + 20);
  assert.equal(softZoom(1), 1);
  assert.ok(softZoom(5) > ZOOM_MAX && softZoom(5) < 5);
  assert.ok(softZoom(0.05) < ZOOM_MIN && softZoom(0.05) > 0.05);
  assert.equal(softZoom(NaN), 1);
  assert.deepEqual(constrainState({ x: 500, z: -500, zoom: 9 }, rects1), { x: rects1[0].x1 + BOUNDS_MARGIN, z: rects1[0].z0 - BOUNDS_MARGIN, zoom: ZOOM_MAX });
});

test("releaseVelocity: flick gives a velocity, resting finger or slow drag gives none, speed is capped", () => {
  const flick = [0, 16, 32, 48, 64, 80].map((t, i) => ({ t, x: i * 0.5, z: 0 }));
  const v = releaseVelocity(flick, 84);
  assert.ok(v.x > 25 && v.x < 35, `v ${v.x}`); assert.equal(v.z, 0);
  assert.deepEqual(releaseVelocity(flick, 400), { x: 0, z: 0 }, "finger rested before lifting");
  assert.deepEqual(releaseVelocity(flick.slice(0, 1), 10), { x: 0, z: 0 });
  assert.deepEqual(releaseVelocity([{ t: 0, x: 0, z: 0 }, { t: 100, x: 0.1, z: 0 }], 105), { x: 0, z: 0 }, "slow");
  const wild = releaseVelocity([{ t: 0, x: 0, z: 0 }, { t: 20, x: 100, z: 0 }], 25);
  close(Math.hypot(wild.x, wild.z), 70, 1e-9, "cap");
});

test("inertiaStep: friction slows down monotonically, total glide is v*tau, it stops", () => {
  let position = { x: 0, z: 0 }, velocity = { x: 20, z: 0 }, steps = 0, speeds = [];
  while (steps < 2000) {
    const next = inertiaStep(position, velocity, 16, rects1);
    position = next.position; velocity = next.velocity; steps++; speeds.push(Math.hypot(velocity.x, velocity.z));
    if (next.done) break;
  }
  assert.ok(steps < 2000, "finishes");
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] <= speeds[i - 1] + 1e-9);
  close(position.x, 20 * 0.32, 0.1, "glide distance = v * tau");
  assert.equal(velocity.x, 0);
});

test("inertiaStep is frame-rate independent (60 Hz vs 120 Hz glide)", () => {
  const run = (dt) => { let p = { x: 0, z: 0 }, v = { x: 15, z: 5 }; for (let t = 0; t < 1200; t += dt) { const n = inertiaStep(p, v, dt, rects1); p = n.position; v = n.velocity; } return p; };
  const a = run(16), b = run(8);
  close(a.x, b.x, 0.05); close(a.z, b.z, 0.05);
});

test("inertiaStep never carries the camera far past the bounds and pulls it back", () => {
  const edge = rects1[0].x1 + BOUNDS_MARGIN;
  let p = { x: edge - 1, z: 5 }, v = { x: 60, z: 0 }, maxX = p.x, done = false;
  for (let i = 0; i < 600 && !done; i++) { const n = inertiaStep(p, v, 16, rects1); p = n.position; v = n.velocity; done = n.done; maxX = Math.max(maxX, p.x); }
  assert.ok(done);
  assert.ok(maxX < edge + 5, `overshoot ${maxX - edge}`);
  close(p.x, edge, 0.02);
});

const pointers = (...list) => list.map(([id, x, y]) => ({ id, x, y }));
const make = (rects = rects1, extra = {}) => createCameraController({ x: 3, z: 6, zoom: 1 }, { view, rects, ...extra });
const settle = (c, ms = 4000, now0 = 10_000) => { for (let t = 0; t < ms; t += 16) c.step(16, now0 + t); };

test("one-finger pan: the grabbed ground point follows the finger exactly", () => {
  const c = make();
  const grab = { x: 300, y: 250 };
  const world = screenToGround(c.state, view, grab);
  c.gesture(pointers([1, grab.x, grab.y]), 0);
  for (let i = 1; i <= 20; i++) c.gesture(pointers([1, grab.x + i * 6, grab.y + i * 3]), i * 16);
  const under = screenToGround(c.state, view, { x: grab.x + 120, y: grab.y + 60 });
  close(under.x, world.x, 1e-6); close(under.z, world.z, 1e-6);
  assert.equal(c.mode, "gesture");
});

test("two-finger gesture: pinch zooms about the midpoint, midpoint also pans", () => {
  const c = make();
  const mid = { x: 450, y: 300 };
  const world = screenToGround(c.state, view, mid);
  c.gesture(pointers([1, mid.x - 50, mid.y], [2, mid.x + 50, mid.y]), 0);
  c.gesture(pointers([1, mid.x - 75, mid.y], [2, mid.x + 75, mid.y]), 16);
  close(c.state.zoom, 1.5, 1e-9);
  let under = screenToGround(c.state, view, mid);
  close(under.x, world.x, 1e-6); close(under.z, world.z, 1e-6);
  // now translate both fingers by (80, -40) while keeping the spread
  c.gesture(pointers([1, mid.x - 75 + 80, mid.y - 40], [2, mid.x + 75 + 80, mid.y - 40]), 32);
  under = screenToGround(c.state, view, { x: mid.x + 80, y: mid.y - 40 });
  close(under.x, world.x, 1e-6); close(under.z, world.z, 1e-6);
  close(c.state.zoom, 1.5, 1e-9);
});

test("lifting one finger of a pinch re-anchors without a jump and continues as a pan", () => {
  const c = make();
  c.gesture(pointers([1, 300, 300], [2, 500, 300]), 0);
  c.gesture(pointers([1, 250, 300], [2, 550, 300]), 16);
  const before = { ...c.state };
  c.gesture(pointers([2, 550, 300]), 32); // finger 1 lifted
  assert.deepEqual(c.state, before);
  c.gesture(pointers([2, 600, 320]), 48);
  const world = screenToGround(before, view, { x: 550, y: 300 });
  const under = screenToGround(c.state, view, { x: 600, y: 320 });
  close(under.x, world.x, 1e-6); close(under.z, world.z, 1e-6);
  assert.equal(c.state.zoom, before.zoom);
  // putting a finger down again also does not jump
  const mid = { ...c.state };
  c.gesture(pointers([2, 600, 320], [3, 700, 320]), 64);
  assert.deepEqual(c.state, mid);
});

test("pinch beyond the zoom limits resists, and on release eases back into [min, max]", () => {
  const c = make();
  c.gesture(pointers([1, 400, 300], [2, 420, 300]), 0);
  c.gesture(pointers([1, 100, 300], [2, 720, 300]), 16); // spread x31
  assert.ok(c.state.zoom > ZOOM_MAX && c.state.zoom < ZOOM_MAX * 1.5, `soft zoom ${c.state.zoom}`);
  c.gesture([], 40);
  assert.equal(c.mode, "ease");
  settle(c, 3000, 100);
  close(c.state.zoom, ZOOM_MAX, 0.01); assert.equal(c.mode, "idle");
});

test("dragging far out of bounds resists, release springs back inside the bounds", () => {
  const c = make();
  c.gesture(pointers([1, 800, 300]), 0);
  c.gesture(pointers([1, 40, 300]), 500); c.gesture(pointers([1, 40, 300]), 1000);
  c.gesture(pointers([1, 800, 300]), 1500);
  // sweep far in one direction repeatedly
  for (let k = 0; k < 20; k++) c.gesture(pointers([1, 40 + (k % 2) * 10, 300]), 2000 + k * 16);
  const dragged = { ...c.state };
  c.gesture([], 5000); // rested a long time: no fling
  settle(c, 4000, 6000);
  const final = constrainState(c.state, rects1);
  close(c.state.x, final.x, 0.02); close(c.state.z, final.z, 0.02);
  assert.ok(dragged.x < 40);
});

test("a fast flick glides after release, a new touch stops it", () => {
  const c = make();
  c.gesture(pointers([1, 200, 300]), 0);
  for (let i = 1; i <= 5; i++) c.gesture(pointers([1, 200 + i * 28, 300]), i * 16);
  const atRelease = { ...c.state };
  c.gesture([], 85);
  assert.equal(c.mode, "inertia");
  assert.ok(c.gliding && c.moving);
  for (let t = 0; t < 120; t += 16) c.step(16, 100 + t);
  assert.ok(Math.hypot(c.state.x - atRelease.x, c.state.z - atRelease.z) > 0.5, "keeps moving");
  c.halt();
  const stopped = { ...c.state };
  settle(c, 500, 400);
  assert.deepEqual(c.state, stopped, "halted for good");
  assert.equal(c.mode, "idle");
});

test("a finger that rests before lifting gives no glide", () => {
  const c = make();
  c.gesture(pointers([1, 200, 300]), 0);
  for (let i = 1; i <= 5; i++) c.gesture(pointers([1, 200 + i * 28, 300]), i * 16);
  c.gesture(pointers([1, 340, 300]), 400);
  c.gesture([], 420);
  assert.equal(c.mode, "idle");
});

test("glide stops at the edge (eased back) and ends inside the bounds", () => {
  const c = make();
  c.set({ x: 30, z: 5 });
  c.gesture(pointers([1, 700, 300]), 0);
  for (let i = 1; i <= 5; i++) c.gesture(pointers([1, 700 - i * 60, 300]), i * 16);
  c.gesture([], 85);
  settle(c, 6000, 100);
  const edge = rects1[0].x1 + BOUNDS_MARGIN;
  assert.ok(c.state.x <= edge + 0.02, `x ${c.state.x}`);
  assert.equal(c.mode, "idle");
});

test("wheel zoom eases towards the target and stays anchored at the cursor throughout", () => {
  const c = make();
  const cursor = { x: 640, y: 180 };
  const world = screenToGround(c.state, view, cursor);
  for (let i = 0; i < 6; i++) { c.wheel(cursor, -100, false); c.step(16, 100 + i * 16); }
  assert.ok(c.state.zoom > 1 && c.state.zoom < c.goal.zoom, "still easing");
  let at = screenToGround(c.state, view, cursor);
  close(at.x, world.x, 1e-6); close(at.z, world.z, 1e-6);
  settle(c, 1500, 1000);
  assert.equal(c.mode, "idle");
  at = screenToGround(c.state, view, cursor);
  close(at.x, world.x, 1e-6); close(at.z, world.z, 1e-6);
  assert.ok(c.state.zoom > 1.2);
});

test("wheel: ctrl (pinch) uses finer steps, zoom is clamped, direction is natural", () => {
  const a = make(), b = make();
  a.wheel({ x: 450, y: 300 }, -10, true); b.wheel({ x: 450, y: 300 }, -10, false);
  assert.ok(a.goal.zoom > b.goal.zoom && a.goal.zoom > 1, "ctrl pinch moves more per pixel than wheel");
  const c = make();
  for (let i = 0; i < 100; i++) c.wheel({ x: 450, y: 300 }, -400, false);
  assert.equal(c.goal.zoom, ZOOM_MAX);
  for (let i = 0; i < 200; i++) c.wheel({ x: 450, y: 300 }, 400, false);
  assert.equal(c.goal.zoom, ZOOM_MIN);
  const d = make(); d.wheel({ x: 450, y: 300 }, 120, false); assert.ok(d.goal.zoom < 1, "scroll down = zoom out");
});

test("zoom anchor survives a cursor move between wheel bursts (new anchor), and wheel is ignored mid-gesture", () => {
  const c = make();
  c.wheel({ x: 100, y: 100 }, -100, false); settle(c, 1000, 0);
  const other = { x: 700, y: 400 };
  const w = screenToGround(c.state, view, other);
  c.wheel(other, -100, false); settle(c, 1000, 2000);
  const at = screenToGround(c.state, view, other);
  close(at.x, w.x, 1e-6); close(at.z, w.z, 1e-6);
  c.gesture(pointers([1, 10, 10]), 5000);
  const zoom = c.goal.zoom; c.wheel(other, -400, false);
  assert.equal(c.goal.zoom, zoom);
});

test("zoomTo animates about the centre (buttons) and reaches the exact level; reduced motion jumps", () => {
  const c = make();
  const centre = screenToGround(c.state, view, { x: 450, y: 300 });
  c.zoomTo(1.2);
  settle(c, 1500, 0);
  close(c.state.zoom, 1.2, 1e-3); close(c.state.x, centre.x, 1e-6); close(c.state.z, centre.z, 1e-6);
  const r = make(rects1, { reducedMotion: true });
  r.zoomTo(2); assert.equal(r.state.zoom, 2); assert.equal(r.mode, "idle");
  r.zoomTo(100); assert.equal(r.state.zoom, ZOOM_MAX);
});

test("focusOn eases to a ground point inside the bounds; flyTo follows a fixed-duration cubic curve", () => {
  const c = make(all);
  c.focusOn({ x: 51, z: 7 }, 1);
  settle(c, 2500, 0);
  close(c.state.x, 51, 0.01); close(c.state.z, 7, 0.01);
  const outside = make(rects1); outside.focusOn({ x: 999, z: 999 });
  settle(outside, 3000, 0);
  assert.ok(outside.state.x <= rects1[0].x1 + BOUNDS_MARGIN + 1e-6);
  const f = make(all);
  f.flyTo({ x: 51, z: 41 }, 1000, 1500);
  f.step(16, 1000); const early = { ...f.state };
  f.step(16, 1750); const middle = { ...f.state };
  f.step(16, 2600); const end = { ...f.state };
  close(end.x, 51, 1e-9); close(end.z, 41, 1e-9);
  assert.ok(early.x < 4, "slow start"); close(middle.x, (3 + 51) / 2, 1e-6, "halfway at half time"); assert.equal(f.mode, "idle");
  const reduced = make(all, { reducedMotion: true }); reduced.flyTo({ x: 51, z: 41 }, 0); assert.equal(reduced.state.x, 51);
});

test("a gesture cancels an ongoing flight / ease / glide; commands are ignored mid-gesture", () => {
  const c = make(all);
  c.flyTo({ x: 51, z: 41 }, 0, 1500); c.step(16, 100);
  c.gesture(pointers([1, 100, 100]), 120);
  assert.equal(c.mode, "gesture");
  const before = { ...c.state };
  c.flyTo({ x: 0, z: 0 }, 130); c.focusOn({ x: 0, z: 0 }); c.zoomTo(2); c.halt();
  assert.deepEqual(c.state, before); assert.equal(c.mode, "gesture");
  c.step(16, 200);
  assert.deepEqual(c.state, before, "stepping does not move a camera held by a finger");
});

test("set() jumps and clears all motion; setRects with a smaller world eases back inside", () => {
  const c = make(all);
  c.set({ x: 80, z: 40, zoom: 1.5 });
  assert.deepEqual(c.state, { x: 80, z: 40, zoom: 1.5 }); assert.equal(c.mode, "idle");
  c.setRects(rects1);
  settle(c, 3000, 0);
  assert.ok(c.state.x <= rects1[0].x1 + BOUNDS_MARGIN + 1e-6);
  c.set({ zoom: 50 }); assert.equal(c.state.zoom, ZOOM_MAX);
});

test("step reports whether anything changed (idle camera costs nothing)", () => {
  const c = make();
  assert.equal(c.step(16, 0), false);
  c.zoomTo(1.5);
  assert.equal(c.step(16, 16), true);
  settle(c, 2000, 100);
  assert.equal(c.step(16, 5000), false);
});

test("all islands reachable: the farthest island centre can be focused when everything is unlocked", () => {
  const c = make(all);
  for (const island of ISLANDS) { c.focusOn(island.focus, 1); settle(c, 3000, 0); close(c.state.x, island.focus.x, 0.01, `island ${island.no}`); close(c.state.z, island.focus.z, 0.01); }
});
