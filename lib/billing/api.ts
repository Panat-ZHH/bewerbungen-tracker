// Billing API logic – PURE (deps injected). Routes: app/api/billing/{checkout,portal,status}/route.ts.
// Contract: STRIPE-PLAN.md "API". Tests: tests/billing-api.test.mjs.
import { BILLING, PLANS, lookupKeyFor, type BillingInterval, type Plan, type PlanId } from "./plans.ts";
import { authorizeOwner, parseOwner, type BillingAuthDeps, type BillingOwner } from "./auth.ts";
import type { BillingStatusBase, BillingStatusForSchool } from "./db-types.ts";

export type PaymentMethod = "card" | "invoice";

export interface BillingApiStripe {
  priceIdForLookupKey(key: string): Promise<string | null>;
  /** idempotencyKey: two concurrent first checkouts of the same owner + user get ONE Stripe customer (key lives 24 h). */
  createCustomer(p: { email: string | null; name: string | null; metadata: Record<string, string>; idempotencyKey?: string }): Promise<string>;
  /**
   * Does the customer already have a subscription in Stripe that is not over (incl. incomplete = payment in progress)?
   * Asked in addition to the DB mirror because the webhook lags a few seconds: a double click on "Rechnung anfordern" or
   * a second tab right after paying would otherwise create a second subscription. Optional (fakes may omit it).
   */
  hasOpenStripeSubscription?(customer: string): Promise<boolean>;
  /** Expires the customer's other OPEN Checkout Sessions of WendApply, so only the newest one can still be paid. Optional. */
  expireOpenCheckoutSessions?(customer: string): Promise<number>;
  createCheckoutSession(p: { customer: string; price: string; kind: "school" | "family"; metadata: Record<string, string>; successUrl: string; cancelUrl: string }): Promise<{ url: string | null }>;
  /** In-app payment (Checkout Session ui_mode "elements" + Payment Element on our own page). */
  createElementsSession(p: { customer: string; price: string; kind: "school" | "family"; metadata: Record<string, string>; returnUrl: string }): Promise<{ clientSecret: string | null }>;
  /** Minimal view of a Checkout Session for the in-app return page. */
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionView | null>;
  createInvoiceSubscription(p: { customer: string; price: string; daysUntilDue: number; metadata: Record<string, string> }): Promise<{ subscriptionId: string; hostedInvoiceUrl: string | null }>;
  createPortalSession(p: { customer: string; returnUrl: string }): Promise<{ url: string }>;
}

export interface CheckoutSessionView {
  status: "open" | "complete" | "expired" | null;
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | null;
  metadata: Record<string, string>;
}

/** Checkout UI: "hosted" = redirect to checkout.stripe.com (fallback), "elements" = Payment Element inside the app. */
export type CheckoutUi = "hosted" | "elements";
/** Return page of the in-app payment (Stripe adds the session id for redirect-based methods like TWINT or 3DS redirects). */
export const IN_APP_RETURN_PATH = "/familie/bezahlen/fertig";

export interface BillingApiDb {
  /** Newest billing_customers.stripe_customer_id of the owner (service role). */
  findCustomerId(owner: BillingOwner): Promise<string | null>;
  /**
   * Remember a freshly created Stripe customer right away (service role), so a cancelled / failed Checkout doesn't leave a
   * new orphan customer each time (the webhook only writes billing_customers after a payment). Optional, best effort.
   */
  saveCustomer?(owner: BillingOwner, customerId: string, userId: string): Promise<void>;
  /**
   * A Stripe subscription that still exists (active / trialing / past_due / unpaid / paused), INCLUDING ones set to cancel at
   * period end: a canceling subscription is renewed in the portal, never bought a second time (P14).
   */
  hasOpenSubscription(owner: BillingOwner): Promise<boolean>;
  /** School name / family name for the Stripe customer (null if unknown). */
  ownerName(owner: BillingOwner): Promise<string | null>;
  /** billing_status_for_school / _family called WITH THE CALLER'S TOKEN (the DB re-checks the role). */
  status(owner: BillingOwner, token: string): Promise<(BillingStatusBase & Partial<BillingStatusForSchool>) | null>;
}

export interface BillingApiDeps {
  enabled: boolean;
  /** Stripe key present (else 503 billing_not_configured). */
  configured: boolean;
  liveMode: boolean;
  baseUrl: string;
  auth: BillingAuthDeps;
  stripe: BillingApiStripe;
  db: BillingApiDb;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

export interface ApiResult { status: number; body: Record<string, unknown> }

/** Canonical origin used when the configured / request origin is not on the allowlist. */
export const CANONICAL_BASE_URL = "https://wendapply.ch";
const ALLOWED_HOSTS = ["wendapply.ch", "www.wendapply.ch"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
/** Netlify production / branch / deploy-preview hosts of this site (e.g. stripe-preview--bewerbungen-pawat.netlify.app). */
const NETLIFY_HOST = /^(?:[a-z0-9-]+--)?bewerbungen-pawat\.netlify\.app$/;

/**
 * Origin for Stripe success / cancel / return / portal URLs. Only allowlisted origins: wendapply.ch, this site's Netlify
 * hosts, localhost (http allowed) and hosts in BILLING_ALLOWED_HOSTS (comma list). Anything else – e.g. a spoofed Host
 * header when APP_URL/URL are unset – falls back to the canonical origin, so Stripe never redirects a payer elsewhere.
 */
export function safeBaseUrl(candidates: (string | null | undefined)[], extraHosts: string[] = []): string {
  for (const raw of candidates) {
    if (!raw) continue;
    let u: URL;
    try { u = new URL(raw); } catch { continue; }
    const host = u.hostname.toLowerCase();
    const local = LOCAL_HOSTS.includes(host);
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) continue;
    if (u.username || u.password) continue;
    if (local || ALLOWED_HOSTS.includes(host) || NETLIFY_HOST.test(host) || extraHosts.includes(host)) return u.origin;
  }
  return CANONICAL_BASE_URL;
}

const err = (status: number, error: string): ApiResult => ({ status, body: { error } });
export const DISABLED: ApiResult = { status: 503, body: { error: "billing_disabled", enabled: false } };

function gate(deps: BillingApiDeps): ApiResult | null {
  if (!deps.enabled) return DISABLED;
  if (!deps.configured) return err(503, "billing_not_configured");
  return null;
}

const returnPath = (owner: BillingOwner) => (owner.kind === "school" ? "/schul-admin" : "/familie");
const ownerMeta = (owner: BillingOwner): Record<string, string> => (owner.kind === "school" ? { school_id: owner.id } : { family_id: owner.id });

/** Where the Stripe customer portal sends the user back. Families get `?billing=portal` so /familie reloads the status (§3.4). */
export function portalReturnUrl(baseUrl: string, owner: BillingOwner): string {
  return `${baseUrl}${returnPath(owner)}${owner.kind === "family" ? "?billing=portal" : ""}`;
}

/** A plan that can be bought through Stripe (has a lookup key and checkout). */
export function purchasablePlan(id: unknown): Plan | null {
  if (typeof id !== "string" || !Object.hasOwn(PLANS, id)) return null;
  const plan = PLANS[id as PlanId];
  return plan.lookupKey && plan.checkout ? plan : null;
}

/** POST /api/billing/checkout  body { plan, schoolId? , familyId?, payment: 'card'|'invoice', interval?: 'year'|'month' (default year), ui?: 'hosted'|'elements' }
 *  hosted → { url } (redirect), elements (families, card) → { clientSecret } for the in-app Payment Element. */
export async function checkout(input: { token: string | null; body: unknown }, deps: BillingApiDeps): Promise<ApiResult> {
  const closed = gate(deps);
  if (closed) return closed;
  const body = (input.body && typeof input.body === "object" ? input.body : {}) as Record<string, unknown>;
  const plan = purchasablePlan(body.plan);
  if (!plan) return err(400, "invalid_plan");
  const payment: PaymentMethod = body.payment === undefined ? "card" : (body.payment as PaymentMethod);
  if (payment !== "card" && payment !== "invoice") return err(400, "invalid_payment");
  const ui: CheckoutUi = body.ui === undefined || body.ui === null ? "hosted" : (body.ui as CheckoutUi);
  if (ui !== "hosted" && ui !== "elements") return err(400, "invalid_ui");
  // In-app payment is built for the family package (consumer, card/wallets). Schools keep the hosted page (UID, invoice address).
  if (ui === "elements" && (plan.kind !== "family" || payment !== "card")) return err(400, "invalid_ui");
  const interval: BillingInterval = body.interval === undefined || body.interval === null ? "year" : (body.interval as BillingInterval);
  if (interval !== "year" && interval !== "month") return err(400, "invalid_interval");
  const lookupKey = lookupKeyFor(plan, interval);
  if (!lookupKey) return err(400, "invalid_interval"); // e.g. monthly for a school plan
  const owner = parseOwner(body);
  if (!owner) return err(400, "invalid_owner");
  if (owner.kind !== plan.kind) return err(400, "plan_owner_mismatch");
  if (payment === "invoice" && !plan.invoiceAllowed) return err(400, "invoice_not_allowed");
  if (plan.placeholder && deps.liveMode) return err(409, "plan_not_available");

  const auth = await authorizeOwner(input.token, owner, deps.auth);
  if (!auth.ok) return err(auth.status, auth.error);

  if (await deps.db.hasOpenSubscription(owner)) return err(409, "already_subscribed"); // change/cancel via the portal

  const price = await deps.stripe.priceIdForLookupKey(lookupKey);
  if (!price) {
    deps.log?.("billing checkout: price missing in Stripe", { lookupKey });
    return err(503, "price_not_found");
  }
  const metadata = { app: "wendapply", plan_id: plan.id, interval, ...ownerMeta(owner), user_id: auth.user.id };
  let customer = await deps.db.findCustomerId(owner);
  if (!customer) {
    customer = await deps.stripe.createCustomer({
      email: auth.user.email, name: await deps.db.ownerName(owner), metadata: { app: "wendapply", ...ownerMeta(owner), user_id: auth.user.id },
      // 10-minute window: enough for the double-click / two-tab race; short enough that a customer deleted in Stripe
      // (Stripe keeps idempotent responses 24 h and would hand back the deleted id) is recreated soon after.
      idempotencyKey: `wendapply-customer-${owner.kind}-${owner.id}-${auth.user.id}-${Math.floor(Date.now() / 600_000)}`,
    });
    await deps.db.saveCustomer?.(owner, customer, auth.user.id).catch((e) => deps.log?.("billing checkout: could not save customer", { error: String(e) }));
  } else if (await deps.stripe.hasOpenStripeSubscription?.(customer)) {
    return err(409, "already_subscribed"); // paid / invoiced seconds ago, the webhook has not mirrored it yet
  }
  // Double checkout (two tabs, interval switch on the pay page, back button): only the newest session stays payable.
  await deps.stripe.expireOpenCheckoutSessions?.(customer);

  if (payment === "invoice") {
    const { hostedInvoiceUrl } = await deps.stripe.createInvoiceSubscription({ customer, price, daysUntilDue: BILLING.invoiceDaysUntilDue, metadata });
    return { status: 200, body: { url: hostedInvoiceUrl, invoice: true } };
  }
  if (ui === "elements") {
    const session = await deps.stripe.createElementsSession({
      customer, price, kind: plan.kind, metadata,
      returnUrl: `${deps.baseUrl}${IN_APP_RETURN_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    });
    if (!session.clientSecret) return err(502, "checkout_failed");
    return { status: 200, body: { clientSecret: session.clientSecret } };
  }
  const base = `${deps.baseUrl}${returnPath(owner)}`;
  const session = await deps.stripe.createCheckoutSession({
    customer, price, kind: plan.kind, metadata,
    successUrl: `${base}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}?billing=cancel`,
  });
  if (!session.url) return err(502, "checkout_failed");
  return { status: 200, body: { url: session.url } };
}

/** POST /api/billing/portal  body { schoolId? , familyId? } */
export async function portal(input: { token: string | null; body: unknown }, deps: BillingApiDeps): Promise<ApiResult> {
  const closed = gate(deps);
  if (closed) return closed;
  const owner = parseOwner((input.body && typeof input.body === "object" ? input.body : {}) as Record<string, unknown>);
  if (!owner) return err(400, "invalid_owner");
  const auth = await authorizeOwner(input.token, owner, deps.auth);
  if (!auth.ok) return err(auth.status, auth.error);
  const customer = await deps.db.findCustomerId(owner);
  if (!customer) return err(404, "no_customer");
  const session = await deps.stripe.createPortalSession({ customer, returnUrl: portalReturnUrl(deps.baseUrl, owner) });
  return { status: 200, body: { url: session.url } };
}

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

/** GET /api/billing/session?id=cs_…  → state of an in-app Checkout Session for the return page. Only the owner who may
 *  manage the subscription (parent / school admin from the session metadata) can read it. The webhook stays the source
 *  of truth for the subscription itself; this only tells the page whether the payment went through. */
export async function checkoutSession(input: { token: string | null; query: URLSearchParams }, deps: BillingApiDeps): Promise<ApiResult> {
  const closed = gate(deps);
  if (closed) return closed;
  const id = input.query.get("id") ?? "";
  if (!SESSION_ID.test(id)) return err(400, "invalid_session");
  if (!input.token) return err(401, "unauthenticated");
  // Verify the token BEFORE asking Stripe: forged / expired tokens must not trigger Stripe API calls (amplification of
  // our Stripe rate limit, the route is public).
  const user = await deps.auth.getUser(input.token);
  if (!user) return err(401, "unauthenticated");
  const session = await deps.stripe.retrieveCheckoutSession(id);
  if (!session || session.metadata.app !== "wendapply") return err(404, "session_not_found");
  const owner = parseOwner({ schoolId: session.metadata.school_id, familyId: session.metadata.family_id });
  if (!owner) return err(404, "session_not_found");
  const allowed = owner.kind === "school" ? await deps.auth.isSchoolAdmin(input.token, owner.id) : await deps.auth.isFamilyParent(input.token, owner.id);
  if (!allowed) return err(404, "session_not_found"); // never confirm foreign sessions
  const plan = purchasablePlan(session.metadata.plan_id);
  const interval = session.metadata.interval === "month" ? "month" : "year";
  return {
    status: 200,
    body: {
      status: session.status, paymentStatus: session.paymentStatus,
      plan: plan?.id ?? null, interval,
      ...(owner.kind === "family" ? { familyId: owner.id } : { schoolId: owner.id }),
    },
  };
}

/** GET /api/billing/status?schoolId=|familyId= */
export async function status(input: { token: string | null; query: URLSearchParams }, deps: BillingApiDeps): Promise<ApiResult> {
  if (!deps.enabled) return DISABLED;
  const owner = parseOwner({ schoolId: input.query.get("schoolId") ?? undefined, familyId: input.query.get("familyId") ?? undefined });
  if (!owner) return err(400, "invalid_owner");
  const auth = await authorizeOwner(input.token, owner, deps.auth);
  if (!auth.ok) return err(auth.status, auth.error);
  const s = await deps.db.status(owner, input.token!);
  return {
    status: 200,
    body: {
      enabled: true,
      plan: s?.plan ?? null,
      status: s?.state ?? null,
      studentLimit: s?.student_limit ?? null,
      validUntil: s?.valid_until ?? null,
      cancelAtPeriodEnd: Boolean(s?.cancel_at_period_end),
      source: s?.source ?? null,
      // extras for the UI
      subscriptionStatus: s?.subscription_status ?? null,
      collectionMethod: s?.collection_method ?? null,
      latestInvoiceStatus: s?.latest_invoice_status ?? null,
      currentPeriodEnd: s?.current_period_end ?? null,
      hasCustomer: Boolean(s?.has_customer),
      studentsUsed: s?.students_used ?? null,
    },
  };
}
