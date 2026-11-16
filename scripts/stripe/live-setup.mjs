#!/usr/bin/env node
/**
 * One-shot LIVE Stripe setup for wendapply.ch (only after Panat's explicit go).
 *
 *   node --experimental-strip-types scripts/stripe/live-setup.mjs [--wait <minutes>] [--check]
 *
 * The live secret key is read from the macOS clipboard (pbpaste) into memory only – never printed, logged or written
 * to a file. Must start with sk_live_ or rk_live_. With --wait it polls the clipboard until such a key appears.
 * Steps (all idempotent):
 *  1. account check (charges_enabled) – stops if the account is not activated
 *  2. scripts/stripe/setup-products.mjs --live (products, prices, customer portal configuration)
 *  3. Netlify production env: STRIPE_SECRET_KEY (--secret), STRIPE_PORTAL_CONFIGURATION_ID
 *  4. live webhook https://wendapply.ch/api/stripe/webhook with exactly the 6 events; its signing secret ->
 *     Netlify production STRIPE_WEBHOOK_SECRET (--secret). An existing endpoint is reused only if the secret is set.
 *  5. verification (read-only)
 * Does NOT touch STRIPE_ENABLED / NEXT_PUBLIC_STRIPE_ENABLED, does not deploy, does not touch the database.
 * --check: only steps 1 and 5 (read-only).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STRIPE_API_VERSION_FOR_SCRIPTS, WEBHOOK_URL, WEBHOOK_EVENTS } from "./live-config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const waitIdx = argv.indexOf("--wait");
const WAIT_MIN = waitIdx >= 0 ? Number(argv[waitIdx + 1] ?? 30) : 0;
const SECRET_RE = /(sk|rk|whsec|pk)_(live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g;
const redact = (s) => String(s).replace(SECRET_RE, "<redacted>");
const log = (...a) => console.log(...a.map(redact));

const readClip = () => { try { return execFileSync("pbpaste", { encoding: "utf8" }).trim(); } catch { return ""; } };
async function getKey() {
  const deadline = Date.now() + WAIT_MIN * 60_000;
  for (;;) {
    const k = readClip();
    if (/^(sk|rk)_live_[A-Za-z0-9]+$/.test(k)) return k;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

const KEY = await getKey();
if (!KEY) { console.error("STOP: the clipboard does not hold a live Stripe key (sk_live_/rk_live_). Copy it again."); process.exit(3); }

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_API_VERSION_FOR_SCRIPTS }, body: method === "GET" ? undefined : body });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message ?? res.status}`);
  return json;
}
const netlify = (args) => spawnSync("netlify", args, { cwd: ROOT, encoding: "utf8" });
function netlifySet(name, value, secret) {
  const r = netlify(["env:set", name, value, "--context", "production", ...(secret ? ["--secret"] : []), "--force"]);
  if (r.status !== 0) throw new Error(`netlify env:set ${name} failed: ${redact(r.stderr || r.stdout).slice(0, 300)}`);
  log(`  netlify production ${name} set${secret ? " (secret)" : ""}`);
}
/** true when the production context has a value (the value itself is never printed). */
function netlifyHas(name) {
  const r = netlify(["env:get", name, "--context", "production"]);
  return r.status === 0 && !/No value set/i.test(r.stdout) && r.stdout.trim().length > 0;
}

// 1. account
const acct = await stripe("GET", "/v1/account");
log(`Account ${acct.id} ${acct.country}/${acct.default_currency} charges_enabled=${acct.charges_enabled} payouts_enabled=${acct.payouts_enabled}`);
if (!acct.charges_enabled) {
  log(`STOP: account not activated. currently_due: ${(acct.requirements?.currently_due ?? []).join(", ") || "-"}; disabled_reason: ${acct.requirements?.disabled_reason ?? "-"}`);
  process.exit(4);
}

if (!CHECK) {
  // 2. catalogue + portal
  log("\n== setup-products --live");
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/stripe/setup-products.mjs", "--live", "--json"], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, STRIPE_ALLOW_LIVE: "yes", STRIPE_LIVE_SECRET_KEY: KEY, STRIPE_SECRET_KEY: "" },
  });
  const out = redact(r.stdout ?? "");
  console.log(out.split("\n{")[0]);
  if (r.status !== 0) { console.error(redact(r.stderr)); process.exit(5); }
  const portalId = (out.match(/"portal":\s*"(bpc_[A-Za-z0-9]+)"/) ?? [])[1];

  // 3. Netlify production env
  log("\n== Netlify (production context)");
  netlifySet("STRIPE_SECRET_KEY", KEY, true);
  if (portalId) netlifySet("STRIPE_PORTAL_CONFIGURATION_ID", portalId, false);

  // 4. webhook
  log("\n== Webhook");
  const hooks = (await stripe("GET", "/v1/webhook_endpoints", { limit: "100" })).data.filter((h) => h.url === WEBHOOK_URL);
  const hasSecret = netlifyHas("STRIPE_WEBHOOK_SECRET");
  if (hooks.length && hasSecret) {
    log(`  endpoint exists (${hooks.map((h) => h.id).join(", ")}) and STRIPE_WEBHOOK_SECRET is set – reusing`);
    for (const h of hooks) {
      const same = [...h.enabled_events].sort().join() === [...WEBHOOK_EVENTS].sort().join();
      if (!same) { await stripe("POST", `/v1/webhook_endpoints/${h.id}`, Object.fromEntries(WEBHOOK_EVENTS.map((e, i) => [`enabled_events[${i}]`, e]))); log(`  ${h.id}: events corrected`); }
    }
  } else {
    if (hooks.length) {
      // secret of an existing endpoint can't be read again -> disable the old one(s), create a fresh one
      for (const h of hooks) { await stripe("POST", `/v1/webhook_endpoints/${h.id}`, { disabled: "true" }); log(`  ${h.id} disabled (secret unknown)`); }
    }
    const params = { url: WEBHOOK_URL, api_version: STRIPE_API_VERSION_FOR_SCRIPTS, description: "WendApply production (wendapply.ch)", "metadata[app]": "wendapply" };
    WEBHOOK_EVENTS.forEach((e, i) => { params[`enabled_events[${i}]`] = e; });
    const h = await stripe("POST", "/v1/webhook_endpoints", params);
    log(`  created ${h.id} (${h.status}, api ${h.api_version})`);
    netlifySet("STRIPE_WEBHOOK_SECRET", h.secret, true);
  }
}

// 5. verify (read-only)
log("\n== Verify");
const prices = await stripe("GET", "/v1/prices", { limit: "100", active: "true" });
for (const p of prices.data.filter((x) => x.metadata?.app === "wendapply")) log(`  price ${p.lookup_key} ${p.id} CHF ${p.unit_amount / 100}/${p.recurring?.interval} tax_behavior=${p.tax_behavior}`);
const hooks = (await stripe("GET", "/v1/webhook_endpoints", { limit: "100" })).data.filter((h) => h.url === WEBHOOK_URL);
for (const h of hooks) log(`  webhook ${h.id} ${h.status} api=${h.api_version} events=${[...h.enabled_events].sort().join(",")}`);
const portals = (await stripe("GET", "/v1/billing_portal/configurations", { limit: "100" })).data.filter((c) => c.metadata?.wendapply_portal === "default");
for (const c of portals) { const f = c.features; log(`  portal ${c.id} active=${c.active} cancel=${f.subscription_cancel.enabled}/${f.subscription_cancel.mode} invoices=${f.invoice_history.enabled} payment_method=${f.payment_method_update.enabled} plan_switch=${f.subscription_update.enabled}`); }
for (const n of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PORTAL_CONFIGURATION_ID", "STRIPE_ENABLED", "NEXT_PUBLIC_STRIPE_ENABLED"]) log(`  netlify production ${n}: ${netlifyHas(n) ? "set" : "not set"}`);
