"use client";

/**
 * Einzelabo ("solo", SPEC §2/§4): monthly or yearly, card only, 1 student. Owner = the caller (`owner: "me"`).
 * Prices always come from lib/billing/plans.ts (PLANS.solo).
 */
import { supabase } from "@/lib/supabase";
import { PLANS, type Plan } from "@/lib/billing/plans";
import { billingErrorMessage, intervalPriceText } from "./logic";

export type SoloInterval = "month" | "year";
/** The Einzelabo plan (prices, lookup keys). */
export function soloPlan(): Plan { return PLANS.solo; }
/** "<monthly> pro Monat oder <yearly> pro Jahr" for any plan with both intervals. */
export function bothPricesText(plan: Plan): string { return `${intervalPriceText(plan, "month")} oder ${intervalPriceText(plan, "year")}`; }

export type SoloOutcome<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null; message: string };

/** German message for the solo-specific API answers (else the shared billing messages). */
export function soloErrorMessage(status: number, code: string | null): string {
  if (code === "solo_parent_use_family") return "Als Elternteil buchst du das Familienpaket. Es gilt für dich und dein Kind.";
  if (code === "solo_students_only") return "Das Einzelabo ist für Schülerinnen und Schüler. Lehrpersonen nutzen WendApply mit einer Schullizenz.";
  if (status === 409 && code === "already_subscribed") return "Du hast schon Zugang über ein Abo, deine Familie oder deine Schule. Änderungen machst du unter «Abo verwalten».";
  return billingErrorMessage(status, code, true);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<SoloOutcome<T>> {
  let status = 0;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(path, { ...init, cache: "no-store", headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    status = res.status;
    let body: unknown = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const code = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null;
      return { ok: false, status, code, message: soloErrorMessage(status, code) };
    }
    return { ok: true, data: body as T };
  } catch { return { ok: false, status, code: null, message: soloErrorMessage(status, null) }; }
}

/** Hosted Stripe Checkout for the Einzelabo → { url } (success / cancel come back to /abo?billing=…). */
export function startSoloCheckout(interval: SoloInterval) {
  return call<{ url: string | null }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "solo", interval, payment: "card", owner: "me" }) });
}
/** In-app Einzelabo payment (Checkout Session ui_mode "elements") → { clientSecret } for the Payment Element on /abo. */
export function startSoloInAppCheckout(interval: SoloInterval) {
  return call<{ clientSecret: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "solo", interval, payment: "card", owner: "me", ui: "elements" }) });
}
/** Where the solo in-app payment goes after a successful confirm (AboView polls my_access on ?billing=success). */
export function soloDoneHref(clientSecret: string): string {
  return `/abo?billing=success&session_id=${encodeURIComponent(clientSecret.split("_secret_")[0])}`;
}
/** Stripe customer portal for the caller's own Einzelabo (returns to /abo?billing=portal). */
export function openSoloPortal() {
  return call<{ url: string }>("/api/billing/portal", { method: "POST", body: JSON.stringify({ owner: "me" }) });
}
