// Checks that every public URL from the SEO inventory still answers 200 (or a permanent redirect that ends in 200),
// plus the new pages and the alias redirects of the website redesign. No external requests: run against a local `next start`.
// Usage: BASE=http://localhost:3202 node scripts/site-url-check.mjs [/path/to/SEO-INVENTORY.json]
import { readFileSync, existsSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3202").replace(/\/$/, "");
const inv = process.argv[2] || "../_ux/baseline/SEO-INVENTORY.json";
const old = existsSync(inv) ? JSON.parse(readFileSync(inv, "utf8")).pages.map((p) => p.path) : [];
const extra = [
  "/funktionen", "/faq", "/ueber-uns", "/sitemap.xml", "/robots.txt", "/manifest.webmanifest", "/og/og-default.png", "/og/og-schulen.png", "/og/og-familien.png",
  "/avv/download", "/logo.png", "/logo-dark.png",
];
const aliases = { "/fuer-eltern": "/familien", "/eltern": "/familien", "/fuer-schulen": "/schulen", "/lehrpersonen": "/schulen", "/funktion": "/funktionen", "/ueber": "/ueber-uns", "/haeufige-fragen": "/faq" };

let bad = 0;
async function check(path, expectTo) {
  let url = BASE + path, hops = [], res;
  for (let i = 0; i < 5; i++) {
    res = await fetch(url, { redirect: "manual" });
    hops.push(res.status);
    if (![301, 302, 307, 308].includes(res.status)) break;
    url = new URL(res.headers.get("location"), url).href;
  }
  const final = new URL(url).pathname;
  const permanentOnly = hops.slice(0, -1).every((s) => s === 301 || s === 308);
  const ok = res.status === 200 && permanentOnly && (!expectTo || final === expectTo);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${path.padEnd(26)} ${hops.join(" -> ")}${final !== path ? `  => ${final}` : ""}`);
}
for (const p of [...new Set([...old, ...extra])]) await check(p);
for (const [from, to] of Object.entries(aliases)) await check(from, to);
console.log(bad ? `\n${bad} URL(s) failed` : "\nAll URLs answer 200 or redirect permanently to a 200.");
process.exit(bad ? 1 : 0);
