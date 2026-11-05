// axe-core sweep (WCAG A/AA incl. contrast) over all routes at 375/1280 × light/dark with the stub from ux-v2-stub.mjs.
// PLAYWRIGHT=... CHROME=... AXE=<axe-core/axe.min.js> node scripts/ux-v2-axe.mjs [--shots dir] [--routes /a,/b]
import fs from "node:fs";
import { BASE, SHOTS, installStub, launch, newCtx } from "./ux-v2-stub.mjs";
const AXE = process.env.AXE || new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname;
const tag = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : "";
const only = process.argv.includes("--routes") ? process.argv[process.argv.indexOf("--routes") + 1].split(",") : null;
const ROUTES = [["login", "/login", false], ["dashboard", "/dashboard"], ["applications", "/applications"], ["applications-new", "/applications/new"], ["applications-detail", "/applications/a1"], ["profile", "/profile"], ["settings", "/settings"], ["cvs", "/cvs"], ["search", "/search"], ["analytics", "/analytics"], ["friends", "/friends"], ["invite", "/invite/LENA-4821"], ["classes", "/classes"], ["classes-join", "/classes/join/KLAS-7Q2"], ["notfound", "/gibt-es-nicht", false]];
const browser = await launch();
const out = {};
const outDir = SHOTS + (tag ? tag + "/" : "");
fs.mkdirSync(outDir, { recursive: true });
for (const [name, path, authed = true] of ROUTES) {
  if (only && !only.includes(path)) continue;
  for (const [w, h] of [[375, 812], [1280, 800]]) for (const dark of [false, true]) {
    const ctx = await newCtx(browser, { w, h, dark });
    await installStub(ctx, { authed });
    const page = await ctx.newPage(); const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 160)));
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"], rules: { "color-contrast": { enabled: true } } }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ t: n.target.join(" "), s: (n.failureSummary || "").split("\n")[1] || "" })), count: v.nodes.length })); });
    const key = `${name} ${w} ${dark ? "dark" : "light"}`;
    out[key] = { res, errs };
    await page.screenshot({ path: `${outDir}${name}-${w}-${dark ? "dark" : "light"}.png`, fullPage: true }).catch(() => {});
    console.log(key, res.map((v) => `${v.id}(${v.count})`).join(" ") || "clean", errs.length ? `ERR:${errs[0]}` : "");
    await ctx.close();
  }
}
fs.writeFileSync(outDir + "axe.json", JSON.stringify(out, null, 1));
await browser.close();
