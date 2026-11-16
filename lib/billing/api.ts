// Billing API logic – PURE (deps injected). Routes: app/api/billing/{checkout,portal,status}/route.ts.
// Contract: STRIPE-PLAN.md "API". Tests: tests/billing-api.test.mjs.
import { BILLING, PLANS, type Plan, type PlanId } from "./plans.ts";
import { authorizeOwner, parseOwner, type BillingAuthDeps, type BillingOwner } from "./auth.ts";
import type { BillingStatusBase, BillingStatusForSchool } from "./db-types.ts";

export type PaymentMethod = "card" | "invoice";

export interface BillingApiStripe {
  priceIdForLookupKey(key: string): Promise<string | null>;
  createCustomer(p: { email: string | null; name: string | null; metadata: Record<string, string> }): Promise<string>;
  createCheckoutSession(p: { customer: string; price: string; kind: "school" | "family"; metadata: Record<string, string>; successUrl: string; cancelUrl: string }): Promise<{ url: string | null }>;
  createInvoiceSubscription(p: { customer: string; price: string; daysUntilDue: number; metadata: Record<string, string> }): Promise<{ subscriptionId: string; hostedInvoiceUrl: string | null }>;
  createPortalSession(p: { customer: string; returnUrl: string }): Promise<{ url: string }>;
}

export interface BillingApiDb {
  /** Newest billing_customers.stripe_customer_id of the owner (service role). */
  findCustomerId(owner: BillingOwner): Promise<string | null>;
  /** A Stripe subscription that still gives access (active / trialing / past_due) and is not set to cancel. */
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

const err = (status: number, error: string): ApiResult => ({ status, body: { error } });
export const DISABLED: ApiResult = { status: 503, body: { error: "billing_disabled", enabled: false } };

function gate(deps: BillingApiDeps): ApiResult | null {
  if (!deps.enabled) return DISABLED;
  if (!deps.configured) return err(503, "billing_not_configured");
  return null;
}

const returnPath = (owner: BillingOwner) => (owner.kind === "school" ? "/schul-admin" : "/familie");
const ownerMeta = (owner: BillingOwner): Record<string, string> => (owner.kind === "school" ? { school_id: owner.id } : { family_id: owner.id });

/** A plan that can be bought through Stripe (has a lookup key and checkout). */
export function purchasablePlan(id: unknown): Plan | null {
  if (typeof id !== "string" || !Object.hasOwn(PLANS, id)) return null;
  const plan = PLANS[id as PlanId];
  return plan.lookupKey && plan.checkout ? plan : null;
}

/** POST /api/billing/checkout  body { plan, schoolId? , familyId?, payment: 'card'|'invoice' } */
export async function checkout(input: { token: string | null; body: unknown }, deps: BillingApiDeps): Promise<ApiResult> {
  const closed = gate(deps);
  if (closed) return closed;
  const body = (input.body && typeof input.body === "object" ? input.body : {}) as Record<string, unknown>;
  const plan = purchasablePlan(body.plan);
  if (!plan) return err(400, "invalid_plan");
  const payment: PaymentMethod = body.payment === undefined ? "card" : (body.payment as PaymentMethod);
  if (payment !== "card" && payment !== "invoice") return err(400, "invalid_payment");
  const owner = parseOwner(body);
  if (!owner) return err(400, "invalid_owner");
  if (owner.kind !== plan.kind) return err(400, "plan_owner_mismatch");
  if (payment === "invoice" && !plan.invoiceAllowed) return err(400, "invoice_not_allowed");
  if (plan.placeholder && deps.liveMode) return err(409, "plan_not_available");

  const auth = await authorizeOwner(input.token, owner, deps.auth);
  if (!auth.ok) return err(auth.status, auth.error);

  if (await deps.db.hasOpenSubscription(owner)) return err(409, "already_subscribed"); // change/cancel via the portal

  const price = await deps.stripe.priceIdForLookupKey(plan.lookupKey!);
  if (!price) {
    deps.log?.("billing checkout: price missing in Stripe", { lookupKey: plan.lookupKey });
    return err(503, "price_not_found");
  }
  const metadata = { app: "wendapply", plan_id: plan.id, ...ownerMeta(owner), user_id: auth.user.id };
  const customer = (await deps.db.findCustomerId(owner))
    ?? (await deps.stripe.createCustomer({ email: auth.user.email, name: await deps.db.ownerName(owner), metadata: { app: "wendapply", ...ownerMeta(owner), user_id: auth.user.id } }));

  if (payment === "invoice") {
    const { hostedInvoiceUrl } = await deps.stripe.createInvoiceSubscription({ customer, price, daysUntilDue: BILLING.invoiceDaysUntilDue, metadata });
    return { status: 200, body: { url: hostedInvoiceUrl, invoice: true } };
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
  const session = await deps.stripe.createPortalSession({ customer, returnUrl: `${deps.baseUrl}${returnPath(owner)}` });
  return { status: 200, body: { url: session.url } };
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
