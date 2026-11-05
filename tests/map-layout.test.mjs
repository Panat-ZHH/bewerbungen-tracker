import assert from "node:assert/strict";
import test from "node:test";
import { centreRegion, nextSheetSnap, overlapRatio, parseStoredFlag, sheetMaxHeight, viewportInsets } from "../lib/map-layout.ts";

test("sheet snaps: small drags stay, long drags switch, far down closes", () => {
  assert.equal(nextSheetSnap("expanded", 10), "expanded");
  assert.equal(nextSheetSnap("expanded", 60), "collapsed");
  assert.equal(nextSheetSnap("collapsed", -60), "expanded");
  assert.equal(nextSheetSnap("collapsed", 20), "collapsed");
  assert.equal(nextSheetSnap("collapsed", 200), "close");
  assert.equal(nextSheetSnap("expanded", 200), "collapsed");
  assert.equal(nextSheetSnap("collapsed", -20, -0.9), "expanded", "a fast flick snaps early");
  assert.equal(nextSheetSnap("expanded", -80), "expanded");
});

test("viewportInsets: no keyboard means no insets", () => {
  assert.deepEqual(viewportInsets({ top: 0, bottom: 800 }, { height: 800, offsetTop: 0 }), { top: 0, bottom: 0, height: 800 });
});

test("viewportInsets: keyboard lifts the bottom edge, mobile tab bar absorbs part of it", () => {
  // stage ends above a 62px tab bar; keyboard of 300px
  assert.equal(viewportInsets({ top: 0, bottom: 738 }, { height: 500, offsetTop: 0 }).bottom, 238);
  // keyboard smaller than the tab bar never creates an inset
  assert.equal(viewportInsets({ top: 0, bottom: 738 }, { height: 780, offsetTop: 0 }).bottom, 0);
});

test("viewportInsets: iOS pan (offsetTop) moves the top inset", () => {
  assert.deepEqual(viewportInsets({ top: 0, bottom: 800 }, { height: 500, offsetTop: 120 }), { top: 120, bottom: 180, height: 500 });
});

test("sheetMaxHeight is ~45dvh and shrinks above the keyboard", () => {
  assert.equal(sheetMaxHeight(800, 800), 360);
  assert.equal(sheetMaxHeight(300, 700), 135);
  assert.ok(sheetMaxHeight(120, 700) >= 64);
});

test("overlapRatio and centreRegion", () => {
  const centre = centreRegion(1000, 600);
  assert.equal(overlapRatio({ left: 0, top: 0, right: 1000, bottom: 80 }, centre), 0);
  assert.equal(overlapRatio({ left: 0, top: 0, right: 1000, bottom: 600 }, centre), 1);
  assert.ok(overlapRatio({ left: 300, top: 300, right: 500, bottom: 480 }, centre) > 0.2);
});

test("parseStoredFlag", () => {
  assert.equal(parseStoredFlag("1", false), true);
  assert.equal(parseStoredFlag("0", true), false);
  assert.equal(parseStoredFlag(null, true), true);
  assert.equal(parseStoredFlag("x", false), false);
});
