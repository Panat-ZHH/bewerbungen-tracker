// QA p0: axe (WCAG A/AA + best-practice) over all routes incl. public + teacher, 375/1280 x light/dark, plus titles, tap targets, reduced motion.
// PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3201 node scripts/qa-p0-axe.mjs [--routes /a,/b]
import fs from "node:fs";
import { BASE, installStub, launch, newCtx } from "./ux-v2-stub.mjs";
const AXE = new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname;
const only = process.argv.includes("--routes") ? process.argv[process.argv.indexOf("--routes") + 1].split(",") : null;
const S = "student", T = "teacher";
const ROUTES = [["/", false], ["/login", false], ["/login/reset", false], ["/schulen", false], ["/impressum", false], ["/kontakt", false], ["/hilfe", false], ["/datenschutz", false], ["/datenschutz-jugend", false], ["/datenschutz-schulen", false], ["/hosting", false], ["/avv", false], ["/loeschkonzept", false], ["/gibt-es-nicht", false],
  ["/dashboard"], ["/applications"], ["/applications/new"], ["/applications/a1"], ["/profile"], ["/settings"], ["/cvs"], ["/search"], ["/analytics"], ["/friends"], ["/friends/u2"], ["/invite/LENA-4821", false], ["/classes"], ["/classes/c1"], ["/classes/join/KLAS-7Q2"], ["/map"], ["/onboarding"],
  ["/teacher", true, T], ["/teacher/classes/c1", true, T], ["/teacher/onboarding", true, T]];
const browser = await launch();
const out = {};
for (const [path, authed = true, role = S] of ROUTES) {
  if (only && !only.includes(path)) continue;
  for (const [w, h] of [[375, 812], [1280, 800]]) for (const dark of [false, true]) {
    const ctx = await newCtx(browser, { w, h, dark });
    await installStub(ctx, { authed, role });
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => {
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
      const small = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab]")].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && (b.width < 24 || b.height < 24) && !(e.tagName === "A" && e.closest("p,li,span") && cs.display === "inline"); }).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 25)}] ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
      return { title: document.title, h1: document.querySelectorAll("h1").length, small, v: r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + ((n.failureSummary || "").split("\n")[1] || "").slice(0, 140)) })) };
    });
    const key = `${path} ${w} ${dark ? "dark" : "light"}`;
    out[key] = res;
    console.log(key, "|", res.title, "| h1:", res.h1, "|", res.v.map((v) => `${v.id}(${v.count},${v.impact})`).join(" ") || "clean", res.small.length ? `| small:${res.small.length}` : "");
    await ctx.close();
  }
}
fs.writeFileSync("/tmp/qa-axe.json", JSON.stringify(out, null, 1));
await browser.close();
