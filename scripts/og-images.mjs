// Renders the Open Graph images (1200x630 PNG) into public/og/: og-default, og-schulen, og-familien.
// Uses a public page of the running dev server only to get the self-hosted brand fonts, then swaps in a static card
// with the logo, the tagline and a current app screenshot from public/landing/ (fictional demo data, see marketing-shots.mjs).
// Usage: PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3311 node scripts/og-images.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3311";
const OUT = fileURLToPath(new URL("../public/og/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const TAGLINE = "Den Bewerbungsprozess sichtbar, planbar und motivierend machen.";
const VARIANTS = [
  { file: "og-default.png", shot: "/landing/04-dashboard-light.webp", label: "Für Schülerinnen und Schüler", tone: "var(--sun)" },
  { file: "og-schulen.png", shot: "/landing/24-teacher-dashboard-light.webp", label: "Für Schulen", tone: "var(--mint)" },
  { file: "og-familien.png", shot: "/landing/familie-overview-light.webp", label: "Für Familien", tone: "var(--coral)" },
];

const card = ({ shot, label, tone }) => `
<div id="og" style="position:fixed;z-index:2147483647;left:0;top:0;width:1200px;height:630px;overflow:hidden;background:#fff9ef;color:#16140f;font-family:var(--font-body),system-ui,sans-serif">
  <div style="position:absolute;inset:0;background-image:radial-gradient(#16140f14 1.2px,transparent 1.2px);background-size:22px 22px"></div>
  <div style="position:absolute;left:64px;top:58px;display:flex;align-items:center;gap:14px">
    <img src="/logo.png" width="64" height="64" alt="" style="display:block">
    <span style="font-family:var(--font-title),sans-serif;font-weight:800;font-size:38px;letter-spacing:-.02em">WendApply</span>
  </div>
  <div style="position:absolute;left:64px;top:168px;width:540px">
    <span style="display:inline-block;transform:rotate(-2deg);background:${tone};border:2.5px solid #16140f;border-radius:999px;padding:7px 18px;font-weight:700;font-size:21px;box-shadow:3px 3px 0 #16140f">${label}</span>
    <p style="margin:26px 0 0;font-family:var(--font-title),sans-serif;font-weight:800;font-size:50px;line-height:1.06;letter-spacing:-.025em">${TAGLINE.replace("motivierend", '<span style="background:linear-gradient(transparent 58%,#ffd23f 58%,#ffd23f 92%,transparent 92%)">motivierend</span>')}</p>
    <p style="margin:24px 0 0;font-size:22px;color:#5c5648;font-weight:500">wendapply.ch · Lehrstellensuche in der Schweiz</p>
  </div>
  <div style="position:absolute;left:640px;top:70px;width:620px;transform:rotate(2.5deg);border:2.5px solid #16140f;border-radius:22px;overflow:hidden;background:#fff;box-shadow:8px 8px 0 #16140f">
    <div style="display:flex;gap:7px;padding:11px 14px;border-bottom:2.5px solid #16140f"><i style="width:12px;height:12px;border-radius:50%;background:#ff7a6b;display:block"></i><i style="width:12px;height:12px;border-radius:50%;background:#ffd23f;display:block"></i><i style="width:12px;height:12px;border-radius:50%;background:#6fdca0;display:block"></i></div>
    <img src="${shot}" alt="" style="display:block;width:100%;height:auto">
  </div>
</div>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "light" });
await ctx.addInitScript(() => localStorage.setItem("wendapply-theme", "light"));
const page = await ctx.newPage();
await page.goto(`${BASE}/impressum`, { waitUntil: "networkidle", timeout: 180000 });
for (const v of VARIANTS) {
  await page.evaluate((html) => { document.getElementById("og")?.remove(); document.documentElement.insertAdjacentHTML("beforeend", html); window.scrollTo(0, 0); }, card(v));
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll("#og img")].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))); });
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: OUT + v.file, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log("wrote", OUT + v.file);
}
await browser.close();
