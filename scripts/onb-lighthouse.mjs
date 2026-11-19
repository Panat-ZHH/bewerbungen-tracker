// Lighthouse mobile (simulated throttling) for /, /start and /login: median of 3 runs, HEAD vs base 23521e3, both as local
// production builds (next build + next start, dummy Supabase env, billing off). Base has no /start: its sign-up entry
// /login?mode=signup is measured instead. Nothing real is contacted.
//
//   node scripts/onb-lighthouse.mjs                 # builds HEAD (this worktree) + base in a temporary worktree, runs, compares
//   node scripts/onb-lighthouse.mjs --head-url=http://localhost:3246 --base-url=http://localhost:3247   # reuse running servers
//   flags: --ref=23521e3  --runs=3  --out=<dir>  --keep (keep the temporary base worktree)
// Env: LIGHTHOUSE (path to the lighthouse bin; default: newest in ~/.npm/_npx), CHROME_PATH.
// Output: <out>/{head,base}/<page>-<i>.json, <out>/summary.json, <out>/summary.md (exit 1 if HEAD is worse beyond tolerance).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareLighthouse, median } from "./onb-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const REF = args.ref || "23521e3";
const RUNS = Number(args.runs || 3);
const OUT = (args.out || join(homedir(), "Projects/bewerbungen-tracker-wt/_onboarding/onb-lighthouse")).replace(/\/$/, "");
const PAGES = { home: { head: "/", base: "/" }, start: { head: "/start", base: "/login?mode=signup" }, login: { head: "/login", base: "/login" } };
const ENV = { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", STRIPE_ENABLED: "false", NEXT_PUBLIC_STRIPE_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" };
process.env.CHROME_PATH ||= "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function findLighthouse() {
  if (process.env.LIGHTHOUSE) return process.env.LIGHTHOUSE;
  const npx = join(homedir(), ".npm/_npx");
  let best = null;
  if (existsSync(npx)) for (const d of readdirSync(npx)) {
    const pkg = join(npx, d, "node_modules/lighthouse/package.json");
    if (!existsSync(pkg)) continue;
    const v = JSON.parse(readFileSync(pkg, "utf8")).version;
    if (!best || v.localeCompare(best.v, undefined, { numeric: true }) > 0) best = { v, bin: join(npx, d, "node_modules/.bin/lighthouse") };
  }
  if (!best) throw new Error("lighthouse not found – run `npx lighthouse --version` once or set LIGHTHOUSE");
  return best.bin;
}
const reachable = async (u) => { try { return (await fetch(u, { signal: AbortSignal.timeout(5000) })).status < 500; } catch { return false; } };
async function serve(dir, port) {
  console.log(`build ${dir} …`);
  execFileSync("npx", ["next", "build"], { cwd: dir, env: { ...process.env, ...ENV }, stdio: "inherit" });
  const child = spawn("npx", ["next", "start", "-p", String(port)], { cwd: dir, env: { ...process.env, ...ENV }, stdio: "ignore" });
  for (let i = 0; i < 90; i++) { if (await reachable(`http://localhost:${port}/login`)) return { url: `http://localhost:${port}`, stop: () => child.kill("SIGTERM") }; await new Promise((r) => setTimeout(r, 1000)); }
  child.kill("SIGTERM"); throw new Error(`server ${dir} did not start`);
}
function lighthouse(bin, url, file) {
  try {
    execFileSync(bin, [url, "--quiet", "--form-factor=mobile", "--only-categories=performance,accessibility,best-practices,seo", "--output=json", `--output-path=${file}`, "--chrome-flags=--headless=new", "--max-wait-for-load=60000"], { stdio: "ignore", timeout: 180000 });
  } catch { console.log(`  run failed: ${url}`); return null; }
  const j = JSON.parse(readFileSync(file, "utf8"));
  const c = j.categories, a = j.audits;
  if (c.performance.score === null) return null;
  return { perf: c.performance.score * 100, a11y: c.accessibility.score * 100, bp: c["best-practices"].score * 100, seo: c.seo.score * 100, lcp: a["largest-contentful-paint"].numericValue / 1000, tbt: a["total-blocking-time"].numericValue, cls: a["cumulative-layout-shift"].numericValue };
}
function measure(bin, url, which) {
  const dir = `${OUT}/${which}`; mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, paths] of Object.entries(PAGES)) {
    const runs = [];
    for (let i = 1; i <= RUNS; i++) { console.log(`${which} ${name} run ${i}`); const r = lighthouse(bin, url + paths[which], `${dir}/${name}-${i}.json`); if (r) runs.push(r); }
    out[name] = runs.length ? Object.fromEntries(Object.keys(runs[0]).map((k) => [k, +median(runs.map((r) => r[k])).toFixed(3)])) : null;
    if (out[name]) out[name].runs = runs.length;
  }
  return out;
}

const bin = findLighthouse();
const stops = [];
let baseTree = null;
try {
  const headUrl = args["head-url"] || (stops.push((await serve(ROOT, 3246)).stop) && "http://localhost:3246");
  let baseUrl = args["base-url"];
  if (!baseUrl) {
    baseTree = join(ROOT, "..", `onb-lh-ref-${REF}`);
    if (!existsSync(baseTree)) execFileSync("git", ["-C", ROOT, "worktree", "add", "--detach", baseTree, REF], { stdio: "inherit" });
    if (!existsSync(join(baseTree, "node_modules"))) execFileSync("cp", ["-c", "-R", join(ROOT, "node_modules"), join(baseTree, "node_modules")]);
    const s = await serve(baseTree, 3247); stops.push(s.stop); baseUrl = s.url;
  }
  const head = measure(bin, headUrl, "head");
  const base = measure(bin, baseUrl, "base");
  const rows = compareLighthouse(base, head);
  writeFileSync(`${OUT}/summary.json`, JSON.stringify({ ref: REF, runs: RUNS, head, base, rows }, null, 2));
  const md = ["| Page | Metric | Base " + REF + " | HEAD | Δ | Worse? |", "|---|---|---|---|---|---|", ...rows.map((r) => `| ${r.page} | ${r.metric} | ${r.base ?? "–"} | ${r.head ?? "–"} | ${r.delta ?? "–"} | ${r.worse ? "**yes**" : "no"} |`)].join("\n");
  writeFileSync(`${OUT}/summary.md`, `# Lighthouse mobile, median of ${RUNS} (local next start)\nBase /start = /login?mode=signup (no funnel on base).\n\n${md}\n`);
  console.log(md);
  process.exitCode = rows.some((r) => r.worse) ? 1 : 0;
} finally {
  for (const s of stops) s();
  if (baseTree && !args.keep) {
    const trash = join(homedir(), ".Trash", `onb-lh-ref-${REF}-${Date.now()}`);
    try { renameSync(baseTree, trash); execFileSync("git", ["-C", ROOT, "worktree", "prune"]); } catch (e) { console.log("could not move the base worktree to the Trash:", e.message); }
  }
  // keep the main worktree's .next only if the caller wants it; the brief says move it to the Trash when done
  if (args["trash-next"] && existsSync(join(ROOT, ".next"))) { try { renameSync(join(ROOT, ".next"), join(homedir(), ".Trash", `onb-test-next-${Date.now()}`)); } catch { /* ignore */ } }
}
