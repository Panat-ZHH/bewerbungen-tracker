import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, statSync } from "node:fs";
import { installMode, isIosSafari } from "../components/pwa/install-logic.ts";
import { pwaEnabled } from "../components/pwa/sw-registration.ts";
import manifest from "../app/manifest.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

test("detects iOS Safari only", () => {
  assert.equal(isIosSafari(IPHONE), true);
  assert.equal(isIosSafari(IPAD_DESKTOP, 5), true);
  assert.equal(isIosSafari(IPAD_DESKTOP, 0), false); // real Mac
  assert.equal(isIosSafari(CHROME_IOS), false);
  assert.equal(isIosSafari(ANDROID), false);
});
test("install hint: dashboard only, never standalone or after dismissal", () => {
  const base = { path: "/dashboard", standalone: false, dismissed: false, hasPrompt: true, iosSafari: false };
  assert.equal(installMode(base), "prompt");
  assert.equal(installMode({ ...base, hasPrompt: false, iosSafari: true }), "ios");
  assert.equal(installMode({ ...base, hasPrompt: false }), null);
  assert.equal(installMode({ ...base, standalone: true }), null);
  assert.equal(installMode({ ...base, dismissed: true }), null);
  for (const path of ["/", "/login", "/anleitung", "/hilfe", "/dashboardx"]) assert.equal(installMode({ ...base, path }), null, path);
});
test("service worker registers in production or with NEXT_PUBLIC_PWA_DEV=1", () => {
  assert.equal(pwaEnabled("production", undefined), true);
  assert.equal(pwaEnabled("development", undefined), false);
  assert.equal(pwaEnabled("development", "1"), true);
});
test("manifest is installable and matches the paper colours", () => {
  const m = manifest();
  assert.equal(m.name, "WendApply");
  assert.equal(m.short_name, "WendApply");
  assert.equal(m.lang, "de");
  assert.equal(m.start_url, "/dashboard?source=pwa");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.ok(css.includes(`--paper: ${m.background_color};`), "background matches light --paper");
  for (const purpose of ["any", "maskable"]) for (const size of ["192x192", "512x512"]) assert.ok(m.icons.some((i) => i.purpose === purpose && i.sizes === size), `${purpose} ${size}`);
  assert.deepEqual(m.shortcuts.map((s) => s.url.split("?")[0]), ["/dashboard", "/applications", "/search"]);
  assert.deepEqual(m.screenshots.map((s) => s.form_factor).sort(), ["narrow", "wide"]);
  for (const f of [...m.icons, ...m.screenshots]) assert.ok(statSync(new URL(`../public${f.src}`, import.meta.url)).size > 0, f.src);
  assert.ok(statSync(new URL("../public/icons/apple-touch-icon.png", import.meta.url)).size > 0);
  assert.ok(statSync(new URL("../public/offline.html", import.meta.url)).size > 0);
});
