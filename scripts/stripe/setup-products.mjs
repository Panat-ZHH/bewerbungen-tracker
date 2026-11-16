#!/usr/bin/env node
/**
 * Creates / updates the WendApply Stripe catalogue from lib/billing/plans.ts – idempotent.
 *
 *   node scripts/stripe/setup-products.mjs            # TEST mode (default)
 *   node scripts/stripe/setup-products.mjs --dry-run  # only show what would change
 *   STRIPE_ALLOW_LIVE=yes node scripts/stripe/setup-products.mjs --live   # LIVE – only after Panat's go
 *
 * What it does (each step "find first, create only if missing"):
 *  1. one Product per plan with a lookupKey, found by metadata.plan_id (metadata: plan_id, student_limit, kind)
 *  2. one CHF Price per plan and interval (yearly; family also monthly), found by lookup_key. If the amount in plans.ts changed, a new Price is created
 *     with transfer_lookup_key=true and the old Price is archived (existing subscriptions keep their old price).
 *  3. a Customer Portal configuration (metadata.wendapply_portal=default): cancel at period end, update payment
 *     method, invoice history, update billing address / e-mail / tax ID.
 *  4. read-only check: which invoice payment methods (customer_balance / Swiss QR-bill) the account supports.
 *
 * Transport: STRIPE_SECRET_KEY from the environment or .env.local (REST via fetch) – otherwise the logged-in
 * Stripe CLI (`stripe get|post`). Secrets are never printed. IDs (prod_, price_, bpc_) are printed; they are not secret.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANS, BILLING, planIntervals, lookupKeyFor, planPrice, planVatIncluded } from "../../lib/billing/plans.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));
const LIVE = args.has("--live");
const DRY = args.has("--dry-run");
const SITE = "https://wendapply.ch";
const PORTAL_TAG = "default";

if (LIVE && process.env.STRIPE_ALLOW_LIVE !== "yes") {
  console.error("Refusing to run against LIVE mode. Set STRIPE_ALLOW_LIVE=yes explicitly (only after approval).");
  process.exit(2);
}

// ---------- config -------------------------------------------------------------------------------------------------
function readEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
const envLocal = readEnvLocal();
const KEY = LIVE ? process.env.STRIPE_LIVE_SECRET_KEY ?? "" : process.env.STRIPE_SECRET_KEY ?? envLocal.STRIPE_SECRET_KEY ?? "";
if (KEY) {
  const isTestKey = /^(sk|rk)_test_/.test(KEY);
  if (!LIVE && !isTestKey) { console.error("STRIPE_SECRET_KEY is not a test key – refusing (test mode is the default)."); process.exit(2); }
  if (LIVE && isTestKey) { console.error("--live given but the key is a test key."); process.exit(2); }
}
const STRIPE_BIN = process.env.STRIPE_CLI ?? (existsSync(join(homedir(), ".local/bin/stripe")) ? join(homedir(), ".local/bin/stripe") : "stripe");

// ---------- transport ----------------------------------------------------------------------------------------------
/** Flattens {a:{b:[1,2]}} into [["a[b][0]","1"],["a[b][1]","2"]] (Stripe form encoding). */
export function formPairs(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (item !== null && typeof item === "object" ? out.push(...formPairs(item, `${key}[${i}]`)) : out.push([`${key}[${i}]`, String(item)])));
    else if (v !== null && typeof v === "object") out.push(...formPairs(v, key));
    else out.push([key, v === null ? "" : String(v)]);
  }
  return out;
}

let writes = 0;
async function api(method, path, params = {}) {
  if (method !== "GET") {
    writes++;
    if (DRY) { console.log(`  [dry-run] ${method} ${path}`); return { id: "(dry-run)", dry: true }; }
  }
  const pairs = formPairs(params);
  if (KEY) {
    const qs = new URLSearchParams(pairs).toString();
    const url = `https://api.stripe.com${path}${method === "GET" && qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2025-03-31.basil" },
      body: method === "GET" ? undefined : qs,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message ?? res.status}`);
    return json;
  }
  const cli = [method === "GET" ? "get" : "post", path, ...pairs.flatMap(([k, v]) => ["-d", `${k}=${v}`])];
  if (method !== "GET") cli.push("--confirm");
  if (LIVE) cli.push("--live");
  const r = spawnSync(STRIPE_BIN, cli, { encoding: "utf8" });
  if (r.error) throw new Error(`Stripe CLI not usable (${r.error.code}). Install it or set STRIPE_SECRET_KEY in .env.local.`);
  const text = r.stdout.slice(r.stdout.indexOf("{"));
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} ${path}: unexpected CLI output (exit ${r.status})`); }
  if (json.error) throw new Error(`${method} ${path}: ${json.error.message}`);
  return json;
}

async function listAll(path, params = {}) {
  const items = [];
  let starting_after;
  for (;;) {
    const page = await api("GET", path, { limit: 100, ...params, starting_after });
    items.push(...page.data);
    if (!page.has_more || !page.data.length) return items;
    starting_after = page.data.at(-1).id;
  }
}

// ---------- catalogue ------------------------------------------------------------------------------------------------
const created = [], updated = [], unchanged = [];

function desiredProduct(plan) {
  return {
    name: `WendApply ${plan.name}`,
    description: plan.kind === "family"
      ? `Familienpaket: ${plan.seats?.children ?? 1} Schüleraccount + ${plan.seats?.parents ?? 1} Elternaccount, Monats- oder Jahresabo (inkl. MWST)`
      : `Schullizenz bis ${plan.studentLimit} Schülerinnen und Schüler, Jahresabo (exkl. MWST)`,
    metadata: { plan_id: plan.id, student_limit: String(plan.studentLimit ?? ""), kind: plan.kind, app: "wendapply" },
  };
}

async function ensureProduct(plan, allProducts) {
  const want = desiredProduct(plan);
  const found = allProducts.filter((p) => p.metadata?.plan_id === plan.id && p.metadata?.app === "wendapply");
  const product = found.find((p) => p.active) ?? found[0];
  if (!product) {
    const p = await api("POST", "/v1/products", want);
    created.push(`product ${plan.id} ${p.id}`);
    return p;
  }
  const diff = product.name !== want.name || product.description !== want.description || !product.active
    || Object.entries(want.metadata).some(([k, v]) => product.metadata?.[k] !== v);
  if (diff) {
    const p = await api("POST", `/v1/products/${product.id}`, { ...want, active: true });
    updated.push(`product ${plan.id} ${product.id}`);
    return p.dry ? product : p;
  }
  unchanged.push(`product ${plan.id} ${product.id}`);
  return product;
}

async function ensurePrice(plan, product, interval = "year") {
  const lookupKey = lookupKeyFor(plan, interval);
  const chf = planPrice(plan, interval);
  const amount = Math.round(chf * 100);
  const taxBehavior = planVatIncluded(plan) ? "inclusive" : "exclusive";
  const [existing] = (await api("GET", "/v1/prices", { "lookup_keys[]": lookupKey })).data;
  const priceMeta = { plan_id: plan.id, app: "wendapply", interval, ...(plan.placeholder ? { placeholder: "true" } : {}) };
  const matches = existing && existing.active && existing.unit_amount === amount && existing.currency === BILLING.currency
    && existing.recurring?.interval === interval && existing.recurring?.interval_count === 1 && existing.product === product.id
    && existing.tax_behavior === taxBehavior;
  if (matches) {
    unchanged.push(`price ${lookupKey} ${existing.id}`);
    return existing;
  }
  const per = interval === "month" ? "Monat" : "Jahr";
  const price = await api("POST", "/v1/prices", {
    product: product.id,
    currency: BILLING.currency,
    unit_amount: amount,
    recurring: { interval, interval_count: 1 },
    tax_behavior: taxBehavior,
    lookup_key: lookupKey,
    transfer_lookup_key: existing ? true : undefined,
    nickname: `${plan.name} ${BILLING.currency.toUpperCase()} ${chf}/${per}${plan.placeholder ? " (PLACEHOLDER)" : ""}`,
    metadata: priceMeta,
  });
  if (existing) {
    // Stripe refuses to archive a product's default price: move the default to the new price first.
    if (!price.dry && product.default_price === existing.id) { await api("POST", `/v1/products/${product.id}`, { default_price: price.id }); product.default_price = price.id; }
    await api("POST", `/v1/prices/${existing.id}`, { active: false });
    updated.push(`price ${lookupKey} ${existing.id} -> ${price.id} (CHF ${existing.unit_amount / 100} -> ${chf}, old price archived)`);
  } else created.push(`price ${lookupKey} ${price.id}`);
  return price;
}

/** Archives active prices of the product that are not one of the catalogue's current lookup keys (e.g. old placeholders). */
async function archiveStrayPrices(plan, product, keep) {
  if (DRY && product.id === "(dry-run)") return;
  const prices = await listAll("/v1/prices", { product: product.id, active: true });
  for (const p of prices) {
    if (keep.has(p.id) || p.id === product.default_price) continue;
    await api("POST", `/v1/prices/${p.id}`, { active: false });
    updated.push(`price ${p.lookup_key ?? "(no lookup key)"} ${p.id} archived (CHF ${p.unit_amount / 100}/${p.recurring?.interval}, not in catalogue)`);
  }
}

async function ensureDefaultPrice(product, price) {
  if (price.dry || product.default_price === price.id) return;
  await api("POST", `/v1/products/${product.id}`, { default_price: price.id });
}

// ---------- customer portal ------------------------------------------------------------------------------------------
const portalWant = {
  business_profile: { headline: "WendApply – Abo und Rechnungen verwalten", privacy_policy_url: `${SITE}/datenschutz` },
  default_return_url: `${SITE}/schul-admin`,
  features: {
    subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
    subscription_update: { enabled: false },
  },
  metadata: { wendapply_portal: PORTAL_TAG, app: "wendapply" },
};

function portalMatches(c) {
  const f = c.features ?? {};
  return c.active
    && c.business_profile?.headline === portalWant.business_profile.headline
    && c.business_profile?.privacy_policy_url === portalWant.business_profile.privacy_policy_url
    && c.default_return_url === portalWant.default_return_url
    && f.subscription_cancel?.enabled && f.subscription_cancel?.mode === "at_period_end" && f.subscription_cancel?.proration_behavior === "none"
    && f.payment_method_update?.enabled && f.invoice_history?.enabled
    && f.customer_update?.enabled && [...(f.customer_update.allowed_updates ?? [])].sort().join() === [...portalWant.features.customer_update.allowed_updates].sort().join()
    && f.subscription_update?.enabled === false;
}

async function ensurePortal() {
  const configs = await listAll("/v1/billing_portal/configurations");
  const mine = configs.filter((c) => c.metadata?.wendapply_portal === PORTAL_TAG);
  const cfg = mine.find((c) => c.active) ?? mine[0];
  if (!cfg) {
    const c = await api("POST", "/v1/billing_portal/configurations", portalWant);
    created.push(`portal configuration ${c.id}`);
    return c;
  }
  if (portalMatches(cfg)) { unchanged.push(`portal configuration ${cfg.id}`); return cfg; }
  const c = await api("POST", `/v1/billing_portal/configurations/${cfg.id}`, { ...portalWant, active: true });
  updated.push(`portal configuration ${cfg.id}`);
  return c.dry ? cfg : c;
}

// ---------- invoice / QR-bill check (read-only) -----------------------------------------------------------------------
async function checkInvoiceMethods() {
  const account = await api("GET", "/v1/account").catch(() => null);
  const pmcs = await listAll("/v1/payment_method_configurations").catch(() => []);
  const def = pmcs.find((c) => c.is_default && c.active) ?? pmcs[0];
  const available = def ? Object.entries(def).filter(([, v]) => v && typeof v === "object" && v.available === true).map(([k]) => k) : [];
  const qrLike = def ? Object.keys(def).filter((k) => /qr|swiss/i.test(k)) : [];
  return {
    country: account?.country ?? "?",
    defaultCurrency: account?.default_currency ?? "?",
    chargesEnabled: account?.charges_enabled ?? null,
    availableMethods: available,
    customerBalance: def?.customer_balance?.available === true,
    swissQrBill: qrLike.some((k) => def[k]?.available === true),
  };
}

// ---------- main -----------------------------------------------------------------------------------------------------
async function main() {
  console.log(`WendApply Stripe catalogue – ${LIVE ? "LIVE MODE" : "test mode"}${DRY ? " (dry run)" : ""} via ${KEY ? "API key" : "Stripe CLI"}`);
  const allProducts = await listAll("/v1/products");
  const report = [];
  for (const plan of Object.values(PLANS)) {
    if (!plan.lookupKey || plan.priceChfPerYear === null) continue;
    if (LIVE && plan.placeholder) { console.log(`  skip ${plan.id}: price is a PLACEHOLDER – decide it in lib/billing/plans.ts first`); continue; }
    const product = await ensureProduct(plan, allProducts);
    const keep = new Set();
    for (const interval of planIntervals(plan)) {
      const price = await ensurePrice(plan, product, interval);
      keep.add(price.id);
      if (interval === "year") await ensureDefaultPrice(product, price);
      report.push({ plan: plan.id, product: product.id, price: price.id, lookupKey: lookupKeyFor(plan, interval), chf: planPrice(plan, interval), interval });
    }
    await archiveStrayPrices(plan, product, keep);
  }
  const portal = await ensurePortal();
  const inv = await checkInvoiceMethods();

  console.log("\nCatalogue:");
  for (const r of report) console.log(`  ${r.plan.padEnd(13)} ${r.product}  ${r.price}  ${r.lookupKey}  CHF ${r.chf}/${r.interval}`);
  console.log(`  portal        ${portal.id}${portal.is_default ? " (account default)" : ""}`);
  console.log(`\nCreated: ${created.length}  Updated: ${updated.length}  Unchanged: ${unchanged.length}  API writes: ${writes}`);
  for (const c of created) console.log(`  + ${c}`);
  for (const u of updated) console.log(`  ~ ${u}`);
  console.log(`\nInvoices: account ${inv.country}/${inv.defaultCurrency}, charges_enabled=${inv.chargesEnabled}`);
  console.log(`  customer_balance (bank transfer) available: ${inv.customerBalance}; Swiss QR-bill method: ${inv.swissQrBill}`);
  console.log(`  payment methods available: ${inv.availableMethods.join(", ") || "-"}`);
  console.log(inv.customerBalance || inv.swissQrBill
    ? "  -> invoices can offer bank transfer."
    : "  -> send_invoice works, but the hosted invoice page offers card only; QR-bill/bank transfer must be added later (see docs/billing/CATALOG.md).");

  // Non-secret IDs other parts need (portal config); written to .env.local only in test mode.
  if (!LIVE && !DRY && portal.id) {
    const p = join(ROOT, ".env.local");
    const cur = existsSync(p) ? readFileSync(p, "utf8") : "";
    const line = `STRIPE_PORTAL_CONFIGURATION_ID=${portal.id}`;
    if (!cur.includes(line)) {
      const next = cur.split("\n").filter((l) => !l.startsWith("STRIPE_PORTAL_CONFIGURATION_ID=")).join("\n").replace(/\n*$/, "\n") + line + "\n";
      writeFileSync(p, next);
      console.log("\n.env.local: STRIPE_PORTAL_CONFIGURATION_ID set");
    }
  }
  if (args.has("--json")) console.log(JSON.stringify({ report, portal: portal.id, created, updated, invoice: inv }, null, 2));
}

main().catch((e) => {
  console.error(`\nFailed: ${String(e.message).replace(/(sk|rk|whsec)_[A-Za-z0-9_]+/g, "<redacted>")}`);
  process.exit(1);
});
