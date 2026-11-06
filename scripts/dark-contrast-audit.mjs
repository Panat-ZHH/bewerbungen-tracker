// Computed-colour contrast audit that also covers what axe skips: disabled controls, ::placeholder, opacity, SVG icons, form borders.
// Usage: PLAYWRIGHT=… CHROME=… BASE=http://localhost:3301 node scripts/dark-contrast-audit.mjs [--light] [--out dir]
import fs from "node:fs";
import { BASE, installStub, launch, newCtx } from "./ux-v2-stub.mjs";
const light = process.argv.includes("--light");
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (out) fs.mkdirSync(out, { recursive: true });
const ROUTES = ["/login", "/dashboard", "/search", "/applications", "/applications/new", "/applications/a1", "/map", "/profile", "/settings", "/cvs", "/analytics", "/friends", "/classes", "/invite/LENA-4821", "/classes/join/KLAS-7Q2"];
const probe = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) { const k = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/); return k ? [k[1] * 255, k[2] * 255, k[3] * 255, k[4] === undefined ? 1 : +k[4]] : null; } const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none" && !/^url/.test(cs.backgroundImage) && /gradient/.test(cs.backgroundImage)) { const cols = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter((c) => c && c[3] > .5); if (cols.length) { stack.push(over(cols.reduce((a, b) => (lum(a) > lum(b) ? a : b)), [0, 0, 0, 1])); break; } } const c = parse(cs.backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= .99) break; } } let base = [13, 17, 24, 1]; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const res = []; const seen = new Set();
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const bg = bgOf(el); const op = opacityOf(el);
    if (ownText) {
      let fg = parse(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color && !/0, 0, 0, 0\)/.test(cs.webkitTextFillColor) ? cs.webkitTextFillColor : cs.color); if (!fg) continue;
      if (/transparent|0, 0, 0, 0\)/.test(cs.webkitTextFillColor)) continue; // gradient text, checked visually
      fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const r = ratio(fg, bg); const px = parseFloat(cs.fontSize); const large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
      if (r < (large ? 3 : 4.5)) { const key = sel(el) + cs.color + r.toFixed(1); if (!seen.has(key)) { seen.add(key); res.push({ kind: "text", sel: sel(el), text: el.textContent.trim().slice(0, 40), ratio: +r.toFixed(2), fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round)})`, disabled: !!el.closest(":disabled,[aria-disabled=true]"), op }); } }
    }
    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.placeholder && !el.value) {
      const ph = getComputedStyle(el, "::placeholder"); const fbg = bgOf(el); let fg = parse(ph.color); fg = over([fg[0], fg[1], fg[2], fg[3] * +ph.opacity * op], fbg); const r = ratio(fg, fbg);
      if (r < 4.5) res.push({ kind: "placeholder", sel: sel(el), ratio: +r.toFixed(2), fg: ph.color, bg: `rgb(${fbg.slice(0, 3).map(Math.round)})` });
    }
    if (el.tagName === "svg" && !el.closest("[aria-hidden=true]:not(svg)") ) {
      const st = parse(cs.color); const fill = cs.fill !== "none" ? parse(cs.fill) : null; const stroke = cs.stroke !== "none" ? parse(cs.stroke) : null; const c = stroke || fill || st; if (!c || /gradient|url/.test(cs.stroke + cs.fill)) continue;
      const fg = over([c[0], c[1], c[2], c[3] * op], bg); const r = ratio(fg, bg); const small = el.getBoundingClientRect().width < 8;
      if (r < 3 && !small && el.parentElement && el.parentElement.textContent.trim() === "" ) res.push({ kind: "icon", sel: sel(el.parentElement), ratio: +r.toFixed(2), fg: cs.stroke, bg: `rgb(${bg.slice(0, 3).map(Math.round)})`, disabled: !!el.closest(":disabled") });
    }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && !["checkbox", "radio", "hidden", "range"].includes(el.type)) {
      const bc = parse(cs.borderTopColor); if (bc && parseFloat(cs.borderTopWidth) > 0) { const pbg = bgOf(el.parentElement); const b = over([bc[0], bc[1], bc[2], bc[3]], pbg); const r = ratio(b, pbg); if (r < 1.4 && ratio(bgOf(el), pbg) < 1.1) res.push({ kind: "field-border", sel: sel(el), ratio: +r.toFixed(2) }); }
    }
  }
  return res;
};
const browser = await launch();
let total = 0;
for (const path of ROUTES) for (const [w, h] of [[390, 844], [1280, 800]]) {
  const ctx = await newCtx(browser, { w, h, dark: !light });
  await installStub(ctx, { authed: !["/login"].includes(path) });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2500);
  const states = [["base", async () => {}]];
  if (path === "/applications/new") states.push(["filled-invalid", async () => { await page.locator("button[type=submit]").first().click({ timeout: 1500 }).catch(() => {}); }]);
  if (path === "/applications") states.push(["status-filter", async () => { await page.locator("select").first().focus().catch(() => {}); }]);
  if (path === "/dashboard") states.push(["more-menu", async () => { await page.getByRole("button", { name: /mehr/i }).first().click({ timeout: 1500 }).catch(() => {}); }]);
  for (const [label, act] of states) {
    await act(); await page.waitForTimeout(500);
    const res = await page.evaluate(probe);
    total += res.length;
    console.log(`${path} ${w} ${label}: ${res.length ? "" : "ok"}`);
    for (const r of res) console.log("   ", JSON.stringify(r));
    if (out) await page.screenshot({ path: `${out}${path.replace(/\W+/g, "_") || "root"}-${w}-${label}.png`, fullPage: true }).catch(() => {});
  }
  await ctx.close();
}
console.log("TOTAL findings:", total);
await browser.close();
