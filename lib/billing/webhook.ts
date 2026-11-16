// Stripe webhook logic – PURE (no network, no Next.js, no Supabase import): the route app/api/stripe/webhook only reads
// the raw body and wires real dependencies in. Tests: tests/billing-webhook.test.mjs. Docs: docs/billing/WEBHOOK-TEST.md.
//
// Flow: verify signature -> duplicate check (stripe_events.processed_at) -> map the event to the FULL current subscription
// state -> billing_apply_subscription (service role; marks the event processed itself) -> 200.
// Events that need no DB change are recorded as processed so a redelivery is a cheap duplicate.
// Answer codes: 400 bad signature / payload, 200 handled or permanently unprocessable (logged, Stripe must not retry
// forever), 500 transient failure (Stripe retries with backoff, the event stays unprocessed).
import type Stripe from "stripe";
import { planByLookupKey } from "./plans.ts";
import type {
  BillingApplySubscriptionParams, BillingApplySubscriptionResult, BillingPlanId, CollectionMethod, InvoiceStatus, StripeSubscriptionStatus,
} from "./db-types.ts";

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
export type HandledEventType = (typeof HANDLED_EVENTS)[number];

/** Database side of the webhook (service role). Real: lib/billing/server.ts, memory: lib/billing/memory-db.ts. */
export interface BillingDb {
  /** true when the event id is in stripe_events with processed_at set. */
  isEventProcessed(eventId: string): Promise<boolean>;
  /** Upsert into stripe_events with processed_at = now() (for events that change nothing). */
  markEventProcessed(eventId: string, type: string): Promise<void>;
  /** rpc('billing_apply_subscription', params); throws Error(message) on a database error. */
  applySubscription(params: BillingApplySubscriptionParams): Promise<BillingApplySubscriptionResult>;
}

/** The few Stripe reads the webhook needs (real: stripe.subscriptions.retrieve). */
export interface WebhookStripe {
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
}

export type VerifyEvent = (rawBody: string, signature: string, secret: string) => Stripe.Event;

export interface WebhookDeps {
  db: BillingDb;
  stripe: WebhookStripe;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

export type WebhookOutcome =
  | { kind: "applied"; subscription: string; licenceStatus: string | null }
  | { kind: "skipped"; reason: string; subscription?: string }
  | { kind: "duplicate" }
  | { kind: "ignored"; reason: string };

export interface WebhookResponse { status: number; body: Record<string, unknown> }

/** DB errors that will never succeed on retry (see docs/billing/DATA-MODEL.md). */
const PERMANENT_DB_ERRORS = ["INVALID_REQUEST", "INVALID_PLAN", "INVALID_STATUS", "BILLING_OWNER_REQUIRED", "BILLING_OWNER_MISMATCH", "LICENCE_LIMIT_REQUIRED", "FORBIDDEN"];
export const isPermanentDbError = (message: string) => PERMANENT_DB_ERRORS.some((code) => message.includes(code));

const STATUSES: StripeSubscriptionStatus[] = ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];
const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "open", "paid", "uncollectible", "void"];
const BILLING_PLAN_IDS: BillingPlanId[] = ["starter", "professional", "enterprise", "individual", "family"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idOf = (value: string | { id: string } | null | undefined): string | null => (value == null ? null : typeof value === "string" ? value : value.id);
const isoFromUnix = (seconds: number | null | undefined): string | null => (typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);
const uuidOrNull = (value: unknown): string | null => (typeof value === "string" && UUID.test(value) ? value : null);

/** Plan of a subscription: price lookup_key first (catalogue), then metadata.plan_id (set by our checkout API). */
export function planOfSubscription(sub: Stripe.Subscription): BillingPlanId | null {
  for (const item of sub.items?.data ?? []) {
    const key = item.price?.lookup_key;
    const plan = key ? planByLookupKey(key) : undefined;
    if (plan && (BILLING_PLAN_IDS as string[]).includes(plan.id)) return plan.id as BillingPlanId;
  }
  const meta = sub.metadata?.plan_id;
  return meta && (BILLING_PLAN_IDS as string[]).includes(meta) ? (meta as BillingPlanId) : null;
}

/** Billing period: on the subscription items since API 2025-03-31 (older payloads: on the subscription). */
function periodOf(sub: Stripe.Subscription): { start: string | null; end: string | null } {
  const items = sub.items?.data ?? [];
  const starts = items.map((i) => i.current_period_start).filter((n): n is number => typeof n === "number");
  const ends = items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  return {
    start: isoFromUnix(starts.length ? Math.min(...starts) : legacy.current_period_start),
    end: isoFromUnix(ends.length ? Math.max(...ends) : legacy.current_period_end),
  };
}

export interface OwnerHint { schoolId?: string | null; familyId?: string | null; userId?: string | null }

/** Maps a Stripe subscription (+ optional owner hint from the checkout session) to billing_apply_subscription params. */
export function subscriptionParams(
  sub: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "type" | "created">,
  extra: { latestInvoiceStatus?: InvoiceStatus | null; owner?: OwnerHint; fresh?: boolean } = {},
): BillingApplySubscriptionParams | { error: string } {
  const plan = planOfSubscription(sub);
  if (!plan) return { error: "unknown_plan" };
  if (!STATUSES.includes(sub.status as StripeSubscriptionStatus)) return { error: "unknown_status" };
  const customer = idOf(sub.customer as string | { id: string });
  if (!customer) return { error: "no_customer" };
  const meta = sub.metadata ?? {};
  const schoolId = uuidOrNull(extra.owner?.schoolId) ?? uuidOrNull(meta.school_id);
  const familyId = uuidOrNull(extra.owner?.familyId) ?? uuidOrNull(meta.family_id);
  const createdBy = uuidOrNull(extra.owner?.userId) ?? uuidOrNull(meta.user_id);
  const period = periodOf(sub);
  const latestInvoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? (sub.latest_invoice as Stripe.Invoice).status : null;
  const invoiceStatus = extra.latestInvoiceStatus ?? (latestInvoice && INVOICE_STATUSES.includes(latestInvoice as InvoiceStatus) ? (latestInvoice as InvoiceStatus) : null);
  const limit = Number(meta.student_limit);
  const params: BillingApplySubscriptionParams = {
    p_stripe_customer_id: customer,
    p_stripe_subscription_id: sub.id,
    p_plan_id: plan,
    p_status: sub.status as StripeSubscriptionStatus,
    p_current_period_start: period.start,
    p_current_period_end: period.end,
    // "Ends, won't renew". Newer API versions (2026-10-28) let the portal cancel by setting `cancel_at` (a date, usually the
    // period end) and leave `cancel_at_period_end` false – seen live on the preview, the UI then kept saying "Aktiv".
    p_cancel_at_period_end: Boolean(sub.cancel_at_period_end) || (sub.cancel_at != null && sub.status !== "canceled"),
    p_collection_method: (sub.collection_method ?? "charge_automatically") as CollectionMethod,
    p_latest_invoice_status: invoiceStatus,
    // Exactly one owner (family plans belong to families). The DB re-checks and keeps the first owner it saw.
    p_school_id: plan === "family" ? null : schoolId,
    p_family_id: plan === "family" ? familyId : null,
    p_created_by: createdBy,
    p_student_limit: plan === "individual" && Number.isInteger(limit) && limit > 0 ? limit : null,
    p_event_id: event.id,
    p_event_type: event.type,
    // Out-of-order guard: snapshots in the payload (customer.subscription.*) carry their event time. A subscription we just
    // retrieved (checkout / invoice events) IS the current state, so it must never be dropped as stale (an invoice.paid
    // created a second before subscription.updated would lose 'paid'); null = no stale check, guard time unchanged.
    // (Using the local clock instead is wrong: seen live, delivery delay/clock skew then rejected a newer cancel.)
    p_event_created: extra.fresh ? null : isoFromUnix(event.created),
  };
  return params;
}

/** Subscription id of an invoice (API 2025-03-31+: invoice.parent.subscription_details; older: invoice.subscription). */
export function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription;
  if (parent) return idOf(parent as string | { id: string });
  return idOf((invoice as unknown as { subscription?: string | { id: string } | null }).subscription);
}

/** Handles one verified event. Never throws for permanent problems; throws for transient ones (=> 500, Stripe retries). */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  const log = deps.log ?? (() => {});
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) {
    await deps.db.markEventProcessed(event.id, event.type);
    return { kind: "ignored", reason: "unhandled_type" };
  }
  if (await deps.db.isEventProcessed(event.id)) return { kind: "duplicate" };

  let sub: Stripe.Subscription | null = null;
  let owner: OwnerHint | undefined;
  let latestInvoiceStatus: InvoiceStatus | null | undefined;
  let fresh = false;
  const retrieve = async (id: string) => {
    const current = await deps.stripe.retrieveSubscription(id);
    fresh = true;
    return current;
  };

  switch (event.type as HandledEventType) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = idOf(session.subscription as string | { id: string } | null);
      if (session.mode !== "subscription" || !subId) {
        await deps.db.markEventProcessed(event.id, event.type);
        return { kind: "ignored", reason: "not_a_subscription_checkout" };
      }
      const meta = session.metadata ?? {};
      owner = { schoolId: meta.school_id, familyId: meta.family_id, userId: meta.user_id ?? session.client_reference_id };
      sub = await retrieve(subId);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      sub = event.data.object as Stripe.Subscription; // the snapshot at event time; out-of-order events are rejected by the DB
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdOfInvoice(invoice);
      if (!subId) {
        await deps.db.markEventProcessed(event.id, event.type);
        return { kind: "ignored", reason: "invoice_without_subscription" };
      }
      sub = await retrieve(subId);
      latestInvoiceStatus = event.type === "invoice.paid" ? "paid" : INVOICE_STATUSES.includes(invoice.status as InvoiceStatus) ? (invoice.status as InvoiceStatus) : "open";
      break;
    }
  }

  const params = subscriptionParams(sub!, event, { owner, latestInvoiceStatus, fresh });
  if ("error" in params) {
    // Not a WendApply subscription (e.g. a `stripe trigger` fixture without plan metadata): acknowledge, never retry.
    log("stripe webhook: skipped", { event: event.id, type: event.type, reason: params.error, subscription: sub!.id });
    await deps.db.markEventProcessed(event.id, event.type);
    return { kind: "ignored", reason: params.error };
  }
  if (!params.p_school_id && !params.p_family_id) log("stripe webhook: no owner in metadata (ok if the customer is known)", { event: event.id, subscription: sub!.id });

  try {
    const result = await deps.db.applySubscription(params);
    if (!result.applied) return { kind: result.reason === "duplicate_event" ? "duplicate" : "skipped", reason: result.reason ?? "not_applied", subscription: sub!.id } as WebhookOutcome;
    return { kind: "applied", subscription: sub!.id, licenceStatus: result.licence_status ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isPermanentDbError(message)) throw error;
    log("stripe webhook: permanent DB error", { event: event.id, type: event.type, error: message.split(":")[0], subscription: sub!.id });
    await deps.db.markEventProcessed(event.id, event.type);
    return { kind: "skipped", reason: message.match(/[A-Z_]{5,}/)?.[0] ?? "db_error", subscription: sub!.id };
  }
}

/** Full request handling for POST /api/stripe/webhook (raw body!). */
export async function processWebhook(
  input: { rawBody: string; signature: string | null; secret: string | undefined; verify: VerifyEvent },
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const log = deps.log ?? (() => {});
  if (!input.secret) return { status: 503, body: { error: "webhook_not_configured" } };
  if (!input.signature) return { status: 400, body: { error: "missing_signature" } };
  let event: Stripe.Event;
  try {
    event = input.verify(input.rawBody, input.signature, input.secret);
  } catch {
    return { status: 400, body: { error: "invalid_signature" } };
  }
  try {
    const outcome = await handleStripeEvent(event, deps);
    log("stripe webhook", { event: event.id, type: event.type, ...outcome });
    return { status: 200, body: { received: true, ...outcome } };
  } catch (error) {
    log("stripe webhook: transient failure, Stripe will retry", { event: event.id, type: event.type, error: error instanceof Error ? error.message.split(":")[0] : "unknown" });
    return { status: 500, body: { error: "processing_failed" } };
  }
}
