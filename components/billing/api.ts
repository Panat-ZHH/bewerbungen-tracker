"use client";

/**
 * Browser calls to the billing API (contract in STRIPE-PLAN.md). Every call sends the Supabase access token as Bearer;
 * the server decides who may buy/manage. Errors come back as a friendly German message, never as a throw.
 */
import { supabase } from "@/lib/supabase";
import { billingErrorMessage, checkoutBody, ownerQuery, readBillingStatus, type BillingInterval, type BillingOwner, type BillingStatus, type PaymentMethod } from "./logic";
import type { PlanId } from "@/lib/billing/plans";

export type ApiOutcome<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null; message: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<ApiOutcome<T>> {
  let status = 0;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
    status = res.status;
    let body: unknown = null;
    try { body = await res.json(); } catch { /* empty or HTML (e.g. 404 page) */ }
    if (!res.ok) {
      const code = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null;
      return { ok: false, status, code, message: billingErrorMessage(status, code) };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status, code: null, message: billingErrorMessage(status) };
  }
}

export async function fetchBillingStatus(owner: BillingOwner): Promise<ApiOutcome<BillingStatus | null>> {
  const r = await call<unknown>(`/api/billing/status?${ownerQuery(owner)}`);
  return r.ok ? { ok: true, data: readBillingStatus(r.data) } : r;
}

export function startCheckout(owner: BillingOwner, plan: PlanId, payment: PaymentMethod, interval: BillingInterval = "year") {
  return call<{ url: string | null; invoice?: boolean }>("/api/billing/checkout", { method: "POST", body: JSON.stringify(checkoutBody(owner, plan, payment, interval)) });
}

export function openPortal(owner: BillingOwner) {
  return call<{ url: string }>("/api/billing/portal", { method: "POST", body: JSON.stringify(owner.kind === "school" ? { schoolId: owner.id } : { familyId: owner.id }) });
}

/** In-app payment: creates a Checkout Session (ui_mode "elements") for the family package → client secret for Stripe.js. */
export function startInAppCheckout(familyId: string, interval: BillingInterval) {
  return call<{ clientSecret: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ ...checkoutBody({ kind: "family", id: familyId }, "family", "card", interval), ui: "elements" }) });
}

export interface CheckoutSessionState {
  status: "open" | "complete" | "expired" | null;
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | null;
  plan: PlanId | null;
  interval: BillingInterval;
  familyId?: string;
  schoolId?: string;
}
/** State of an in-app Checkout Session (return page). */
export function fetchCheckoutSession(id: string) {
  return call<CheckoutSessionState>(`/api/billing/session?id=${encodeURIComponent(id)}`);
}
