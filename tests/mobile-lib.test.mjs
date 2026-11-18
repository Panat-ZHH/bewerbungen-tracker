// Unit tests for the pure parts of the responsive harness (scripts/mobile-lib.mjs). No browser, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  buildMatrix, PERSONAS, coveredRoutes, classifyTarget, inputTypeHint, viewportMetaIssue, ownerFor, severityOf, fillPath,
  aggregate, matrixTable, ownerMarkdown, variantsFor, modeOf, expectsBottomNav, auditExpression,
} from "../scripts/mobile-lib.mjs";

const fakeRegistry = Object.fromEntries([
  ["iPhone SE (3rd gen)", 375, 667, "webkit"], ["iPhone 15", 393, 659, "webkit"], ["iPhone 15 Pro Max", 430, 739, "webkit"], ["iPad (gen 7)", 810, 1080, "webkit"],
  ["Pixel 7", 412, 839, "chromium"], ["Galaxy Tab S4", 712, 1138, "chromium"],
].map(([n, w, h, b]) => [n, { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, defaultBrowserType: b }]));

test("device matrix covers the required devices, widths and landscapes", () => {
  const m = buildMatrix(fakeRegistry);
  const ids = m.map((d) => d.id);
  for (const id of ["iphone-se", "iphone-15", "iphone-15-pro-max", "ipad", "pixel-7", "galaxy-s23", "galaxy-tab-s4", "iphone-15-pwa", "land667x375", "land844x390", "land932x430"]) assert.ok(ids.includes(id), id);
  for (const w of [320, 360, 375, 390, 412, 430, 600, 768, 1024]) assert.ok(ids.includes(`w${w}`), `w${w}`);
  assert.ok(m.every((d) => d.touch), "every device has touch");
  assert.equal(m.find((d) => d.id === "iphone-15").browser, "webkit");
  assert.equal(m.find((d) => d.id === "galaxy-s23").options.viewport.width, 360);
  assert.ok(m.find((d) => d.id === "iphone-15-pwa").safeArea.bottom > 0);
  assert.equal(m.find((d) => d.id === "w768").mobile, false, "bottom nav is md:hidden at 768");
  assert.equal(expectsBottomNav(767), true);
  assert.deepEqual(buildMatrix(fakeRegistry, { only: ["w320"] }).map((d) => d.id), ["w320"]);
});

test("variants: light everywhere, dark + text scale on subsets", () => {
  assert.deepEqual(variantsFor("w600").map(modeOf), ["base"]);
  assert.deepEqual(variantsFor("pixel-7").map(modeOf), ["base", "dark", "text130", "text200"]);
  assert.deepEqual(variantsFor("w600", { allDark: true, themes: ["light", "dark"] }).map(modeOf), ["base", "dark"]);
});

test("every app route (app/**/page.tsx) is covered by a persona page", () => {
  const appDir = join(import.meta.dirname, "..", "app");
  const routes = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "page.tsx") routes.push("/" + relative(appDir, d).split(sep).filter((s) => !/^\(.*\)$/.test(s)).join("/")); } };
  walk(appDir);
  const covered = [...coveredRoutes()].map((r) => r.replace(/\/$/, "") || "/");
  const norm = (r) => (r.replace(/\[[^\]]+\]/g, "[x]").replace(/\/$/, "") || "/");
  const missing = routes.map(norm).filter((r) => !covered.some((c) => c === r || c.replace(/\/[^/]+$/, "/[x]") === r));
  assert.deepEqual(missing, [], "routes without a responsive check");
  assert.ok(PERSONAS.some((p) => p.role === "eltern") && PERSONAS.some((p) => p.role === "lehrperson") && PERSONAS.some((p) => p.role === "schule"));
});

test("tap target classification", () => {
  assert.equal(classifyTarget({ w: 44, h: 44 }), null);
  assert.equal(classifyTarget({ w: 120, h: 30, inNav: true }), "target-primary");
  assert.equal(classifyTarget({ w: 120, h: 42, primary: true }), "target-small");
  assert.equal(classifyTarget({ w: 20, h: 20, inlineText: true }), null);
  assert.equal(classifyTarget({ w: 30, h: 30 }), "target-small");
});

test("input hints and viewport meta", () => {
  assert.match(inputTypeHint({ type: "text", hint: "E-Mail der Eltern" }), /e-mail/);
  assert.equal(inputTypeHint({ type: "email", hint: "E-Mail" }), null);
  assert.match(inputTypeHint({ type: "text", hint: "Telefon" }), /tel/);
  assert.equal(inputTypeHint({ type: "text", inputmode: "numeric", hint: "PLZ" }), null);
  assert.equal(viewportMetaIssue("width=device-width, initial-scale=1, viewport-fit=cover"), null);
  assert.match(viewportMetaIssue("width=device-width, user-scalable=no"), /user-scalable/);
  assert.match(viewportMetaIssue("width=device-width, maximum-scale=1"), /maximum-scale/);
  assert.match(viewportMetaIssue(null), /no <meta/);
});

test("owner mapping follows the brief", () => {
  assert.equal(ownerFor("schueler", "/map"), "VILLAGE");
  assert.equal(ownerFor("schueler", "/friends/abc"), "VILLAGE");
  assert.equal(ownerFor("schueler", "/dashboard"), "SHELL");
  assert.equal(ownerFor("schueler", "/dashboard", 'nav[aria-label="Hauptmenü mobil"]'), "SHELL");
  assert.equal(ownerFor("eltern", "/familie"), "ROLES");
  assert.equal(ownerFor("public", "/classes/join/X"), "ROLES");
  assert.equal(ownerFor("public", "/familie/einladung/X"), "ROLES");
  assert.equal(ownerFor("public", "/login"), "SHELL");
  assert.equal(ownerFor("public", "/invite/X"), "SHELL");
  assert.equal(ownerFor("public", "/preise"), "PUBLIC");
  assert.equal(ownerFor("lehrperson", "/teacher/classes/1?tab=news"), "ROLES");
});

test("severity, aggregation and report tables", () => {
  assert.equal(severityOf({ kind: "sheet-under-nav" }), "error");
  assert.equal(severityOf({ kind: "target-small" }), "warn");
  assert.equal(fillPath("/classes/{classId}/students/{studentId}", { classId: "c 1", studentId: "s" }), "/classes/c%201/students/s");
  assert.equal(fillPath("/x/{missing}", {}), "/x/{missing}");
  const results = [
    { device: "iphone-se", persona: "schueler", role: "schueler", page: "map-item", path: "/map", mode: "base", issues: [{ kind: "sheet-under-nav", sel: "div.panel", msg: "panel 500..700px" }] },
    { device: "pixel-7", persona: "schueler", role: "schueler", page: "map-item", path: "/map", mode: "base", issues: [{ kind: "sheet-under-nav", sel: "div.panel", msg: "panel 480..690px" }] },
    { device: "pixel-7", persona: "public", role: "public", page: "home", path: "/", mode: "base", issues: [] },
  ];
  const agg = aggregate(results);
  assert.equal(agg.length, 1, "same issue merged across devices (numbers ignored)");
  assert.deepEqual(agg[0].devices, ["iphone-se", "pixel-7"]);
  assert.equal(agg[0].owner, "VILLAGE");
  const table = matrixTable(results, [{ id: "iphone-se" }, { id: "pixel-7" }]);
  assert.match(table, /\| schueler map-item \| \*\*1\*\* \| \*\*1\*\* \|/);
  assert.match(table, /\| public home \| – \| · \|/);
  assert.match(ownerMarkdown("VILLAGE", agg), /sheet-under-nav/);
  assert.match(ownerMarkdown("PUBLIC", agg), /No findings/);
});

test("audit expression is a self-contained string", () => {
  const expr = auditExpression({ mobile: true });
  assert.equal(typeof expr, "string");
  assert.match(expr, /classifyTarget/);
  assert.doesNotThrow(() => new Function(`return ${expr.replace(/^\(/, "(() => 0) || (")}`));
});
