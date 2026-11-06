// E2E for "Weiter mit Google". Needs the REAL Supabase env (.env.local): the first check follows the real authorize
// redirect to accounts.google.com (no credentials are entered). The callback checks need no network.
//   node scripts/google-login-e2e.mjs            # spawns a dev server on a free port
//   BASE=http://localhost:3000 node scripts/google-login-e2e.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const pwPath = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find((p) => p && existsSync(p));
const { chromium } = await import(pwPath ? pathToFileURL(pwPath).href : "playwright-core");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const freePort = () => new Promise((res) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
const reachable = (u) => fetch(u).then((r) => r.status < 500, () => false);
let server;
let base = process.env.BASE;
if (!base || !(await reachable(base))) {
  const port = await freePort();
  server = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: ROOT, stdio: "ignore" });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 120 && !(await reachable(base)); i++) await new Promise((r) => setTimeout(r, 1000));
}

let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + info}`); };
const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  for (const [label, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["mobile (iPhone)", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" }]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    let popup = false;
    ctx.on("page", (p) => { if (p !== page) popup = true; });

    // 1. button -> same-tab redirect to Google with the Supabase callback as redirect_uri
    await page.goto(`${base}/login?next=%2Fsearch`);
    const authorize = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"), { timeout: 15000 });
    const oauthReq = page.waitForRequest((r) => /accounts\.google\.com\/o\/oauth2/.test(r.url()), { timeout: 30000 }).catch(() => null);
    const google = page.waitForURL(/accounts\.google\.com/, { timeout: 30000 }).then(() => true, () => false);
    await page.getByRole("button", { name: "Weiter mit Google" }).click();
    const authUrl = new URL((await authorize).url());
    check(authUrl.searchParams.get("provider") === "google", `[${label}] authorize request for provider=google`);
    check(authUrl.searchParams.get("redirect_to") === `${base}/auth/callback?next=%2Fsearch`, `[${label}] redirect_to is <origin>/auth/callback?next=/search`, authUrl.searchParams.get("redirect_to"));
    check(authUrl.searchParams.get("code_challenge_method") === "s256" && !!authUrl.searchParams.get("code_challenge"), `[${label}] PKCE code_challenge sent`);
    check(await google, `[${label}] browser lands on accounts.google.com`, page.url());
    const g = new URL((await oauthReq)?.url() ?? page.url()); // the first Google request carries the OAuth params
    check(g.searchParams.get("redirect_uri") === `${SUPABASE}/auth/v1/callback`, `[${label}] Google redirect_uri is the Supabase callback`, g.searchParams.get("redirect_uri"));
    check(g.searchParams.get("client_id")?.endsWith(".apps.googleusercontent.com"), `[${label}] Google client_id present`);
    check(!popup, `[${label}] same-tab redirect (no popup)`);

    // 2. callback error handling (no network needed)
    const cases = [
      ["?error=access_denied&error_description=User+denied", /abgebrochen/],
      ["?error=server_error&error_code=signup_disabled&error_description=Signups+not+allowed", /Neue Konten/],
      ["#error=access_denied&error_code=otp_expired&error_description=expired", /abgebrochen|abgelaufen/],
      ["", /nicht abgeschlossen|abgelaufen/],
      ["?code=bogus", /abgelaufen|nicht geklappt/],
    ];
    for (const [qs, re] of cases) {
      await page.goto(`${base}/auth/callback${qs}`);
      await page.getByText(re).first().waitFor({ timeout: 15000 }).then(() => check(true, `[${label}] callback ${qs || "(no params)"} shows German error`), (e) => check(false, `[${label}] callback ${qs || "(no params)"} shows German error`, e.message.split("\n")[0]));
      check(await page.getByRole("link", { name: "Zurück zur Anmeldung" }).isVisible(), `[${label}] callback error offers a way back`);
    }

    // 3. login page shows provider errors and cleans the URL; ?next survives
    await page.goto(`${base}/login?error=access_denied&next=%2Fsearch`);
    await page.getByText(/abgebrochen/).waitFor({ timeout: 10000 }).then(() => check(true, `[${label}] /login shows error from ?error=`), () => check(false, `[${label}] /login shows error from ?error=`));
    check(page.url() === `${base}/login?next=%2Fsearch`, `[${label}] error removed from URL, next kept`, page.url());

    await ctx.close();
  }
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll Google-login checks passed");
process.exit(failed ? 1 : 0);
