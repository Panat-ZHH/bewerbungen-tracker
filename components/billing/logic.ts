/**
 * Pure helpers for the billing UI (no React, no fetch): flag, plans, labels, API error texts, return messages.
 * Plain TS so `node --experimental-strip-types --test` can import it. Prices always come from lib/billing/plans.ts.
 * Swiss spelling only (ss, never the sharp s).
 */
import { FAMILY_COPY } from "../../lib/family-copy.ts";
import { BILLING, PLANS, formatChf, isStripeEnabledClient, planIntervals, planPrice, yearlySavingChf, type BillingInterval, type Plan, type PlanId } from "../../lib/billing/plans.ts";

export type { BillingInterval };

export type PaymentMethod = "card" | "invoice";
export type BillingOwner = { kind: "school"; id: string } | { kind: "family"; id: string };
export type BillingReturn = "success" | "cancel";

/** Online payment switched on? (NEXT_PUBLIC_STRIPE_ENABLED, inlined at build time). Default OFF. */
export function onlinePaymentEnabled(): boolean {
  return isStripeEnabledClient();
}

/** Honest copy while the flag is off. */
export const FREE_NOTICE = "WendApply ist aktuell kostenlos. Online-Bezahlung folgt.";

/** School plans that can be bought online, in catalogue order (starter, professional, enterprise). */
export function schoolPlans(): Plan[] {
  return Object.values(PLANS).filter((p) => p.kind === "school" && p.checkout && p.priceChfPerYear !== null);
}
export const familyPlan = (): Plan => PLANS.family;

export function isPurchasable(id: string | null | undefined, kind: Plan["kind"]): id is PlanId {
  const p = id ? (PLANS as Record<string, Plan | undefined>)[id] : undefined;
  return !!p && p.kind === kind && p.checkout && p.priceChfPerYear !== null;
}

/** Families: card only. Schools: card, plus invoice when the plan allows it. */
export function paymentOptions(plan: Plan): PaymentMethod[] {
  if (plan.kind === "family") return ["card"];
  return plan.invoiceAllowed ? ["card", "invoice"] : ["card"];
}

export const PAYMENT_LABEL: Record<PaymentMethod, { title: string; text: string }> = {
  card: { title: "Kreditkarte", text: "Sofort freigeschaltet. Die Zahlung läuft sicher über unseren Zahlungsanbieter." },
  invoice: { title: "Rechnung", text: `Sie erhalten eine Rechnung per E-Mail, zahlbar innert ${BILLING.invoiceDaysUntilDue} Tagen.` },
};

const PER: Record<BillingInterval, string> = { year: "pro Jahr", month: "pro Monat" };

/** "<formatChf> pro Jahr" (final price, no VAT – BILLING.vatRegistered is false). null price = on request, 0 = free. Plans with a monthly price: both. */
export function priceText(plan: Plan): string {
  if (plan.priceChfPerYear === null) return "Preis auf Anfrage";
  if (plan.priceChfPerYear === 0) return "Kostenlos";
  if (planIntervals(plan).includes("month")) return `${intervalPriceText(plan, "month")} oder ${intervalPriceText(plan, "year")}`;
  return `${formatChf(plan.priceChfPerYear)} pro Jahr`;
}
/** "<formatChf> pro Monat" / "<formatChf> pro Jahr" for one interval. */
export function intervalPriceText(plan: Plan, interval: BillingInterval): string {
  const n = planPrice(plan, interval);
  return n === null ? "Preis auf Anfrage" : `${formatChf(n)} ${PER[interval]}`;
}
/** Intervals a plan can be bought in (family: month + year; schools: year). */
export const billingIntervals = (plan: Plan): BillingInterval[] => planIntervals(plan);
export const INTERVAL_LABEL: Record<BillingInterval, string> = { month: "Monatlich", year: "Jährlich" };
/** "<formatChf saving> günstiger als 12 Monatszahlungen" or null when there is no monthly price. */
export function savingText(plan: Plan): string | null {
  const s = yearlySavingChf(plan);
  return s > 0 ? `${formatChf(s)} günstiger als 12 Monatszahlungen` : null;
}
/** "Monatsabo, kündbar auf Ende des Monats" / "Jahresabo, kündbar auf Ende der Laufzeit". */
export function termText(interval: BillingInterval): string {
  return interval === "month" ? "Monatsabo, kündbar auf Ende des Monats" : "Jahresabo, kündbar auf Ende der Laufzeit";
}
export function seatsText(plan: Plan): string {
  if (plan.kind === "family") return `${plan.seats?.children ?? 1} Schüleraccount + ${plan.seats?.parents ?? 1} Elternaccount`;
  return plan.studentLimit ? `bis ${plan.studentLimit} Schülerinnen und Schüler` : "Anzahl nach Absprache";
}

/** Where the "online abschliessen" buttons on /preise lead (sign-in is handled there). */
export function buyHref(id: PlanId, interval?: BillingInterval): string {
  const i = interval && planIntervals(PLANS[id]).includes(interval) ? `&interval=${interval}` : "";
  return PLANS[id].kind === "family" ? `/familie?plan=${id}${i}#abo` : `/schul-admin?plan=${id}${i}#abo`;
}

// ---------------------------------------------------------------- status
export interface BillingStatus {
  enabled: boolean;
  plan: PlanId | null;
  status: string | null;
  studentLimit: number | null;
  validUntil: string | null;
  cancelAtPeriodEnd: boolean;
  source: string | null;
  subscriptionStatus: string | null;
  collectionMethod: string | null;
  latestInvoiceStatus: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** Normalises the GET /api/billing/status payload (tolerant: unknown fields are ignored, wrong types become null). */
export function readBillingStatus(v: unknown): BillingStatus | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const plan = str(r.plan);
  return {
    enabled: r.enabled === true,
    plan: plan && plan in PLANS ? (plan as PlanId) : null,
    status: str(r.status),
    studentLimit: typeof r.studentLimit === "number" ? r.studentLimit : null,
    validUntil: str(r.validUntil),
    cancelAtPeriodEnd: r.cancelAtPeriodEnd === true,
    source: str(r.source),
    subscriptionStatus: str(r.subscriptionStatus),
    collectionMethod: str(r.collectionMethod),
    latestInvoiceStatus: str(r.latestInvoiceStatus),
  };
}

// ---------------------------------------------------------------- billing phase (BILLING-FLOW-SPEC §3.5)
/** One state for the whole UI, derived from GET /api/billing/status. The family UI uses only this. */
export type BillingPhase = "none" | "incomplete" | "trialing" | "active" | "past_due" | "canceling" | "paused" | "unpaid" | "ended";
export const BILLING_PHASES: readonly BillingPhase[] = ["none", "incomplete", "trialing", "active", "past_due", "canceling", "paused", "unpaid", "ended"];

/**
 * Stripe subscription status (+ cancel_at_period_end) or, for manual/pilot rows, the licence state -> BillingPhase.
 * A licence state `expired` always wins (the period is over even if Stripe still says canceled/active).
 */
export function billingPhase(s: BillingStatus | null): BillingPhase {
  if (!s) return "none";
  if (s.status === "expired") return "ended";
  const sub = s.subscriptionStatus;
  if (!sub) {
    if (s.source === "stripe") return s.status === "active" ? (s.cancelAtPeriodEnd ? "canceling" : "active") : s.status ? "ended" : "none";
    // Manual / pilot licence (no Stripe subscription): trial and pilot read as a trial, active as active.
    if (s.status === "trial" || s.status === "trialing" || s.status === "pilot") return "trialing";
    if (s.status === "active") return "active";
    if (s.status === "paused") return "paused";
    return "none";
  }
  switch (sub) {
    case "active": return s.cancelAtPeriodEnd ? "canceling" : "active";
    case "trialing": return s.cancelAtPeriodEnd ? "canceling" : "trialing";
    case "past_due": return "past_due";
    case "unpaid": return "unpaid";
    case "incomplete": return "incomplete";
    case "paused": return "paused";
    case "canceled": case "cancelled": case "incomplete_expired": return "ended";
    default: return "none";
  }
}
/** Phases where a (still) valid subscription exists: no second checkout, manage it in the portal instead. */
export const SUBSCRIBED_PHASES: readonly BillingPhase[] = ["trialing", "active", "canceling", "past_due", "unpaid", "paused"];
/** Phases where the family can (re)buy: nothing yet, an abandoned first payment, or an ended subscription. */
export const BUYABLE_PHASES: readonly BillingPhase[] = ["none", "incomplete", "ended"];
/** Phases that need the parent's attention: banner on top of /familie + primary "Karte aktualisieren". */
export const ATTENTION_PHASES: readonly BillingPhase[] = ["past_due", "unpaid"];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const PHASE_BADGE_KEY: Record<BillingPhase, keyof typeof FAMILY_COPY.badge> = {
  none: "none", incomplete: "incomplete", trialing: "trialing", active: "active", past_due: "pastDue", canceling: "canceling", paused: "paused", unpaid: "unpaid", ended: "ended",
};
const PHASE_TONE: Record<BillingPhase, Tone> = {
  none: "neutral", incomplete: "warning", trialing: "info", active: "success", past_due: "warning", canceling: "neutral", paused: "warning", unpaid: "danger", ended: "neutral",
};
/** Badge of a phase (§4.3); `none` has no badge (label ""). */
export function phaseBadge(phase: BillingPhase): { label: string; tone: Tone } {
  return { label: FAMILY_COPY.badge[PHASE_BADGE_KEY[phase]], tone: PHASE_TONE[phase] };
}
/** Body text of a phase with {date} filled (§4.3 `phase.*`); `none` -> "". */
export function phaseText(phase: BillingPhase, date: string): string {
  const t: Record<BillingPhase, string> = {
    none: "", active: FAMILY_COPY.phase.active, trialing: FAMILY_COPY.phase.trialing, canceling: FAMILY_COPY.phase.canceling,
    past_due: FAMILY_COPY.phase.pastDue, unpaid: FAMILY_COPY.phase.unpaid, paused: FAMILY_COPY.phase.paused,
    incomplete: FAMILY_COPY.phase.incomplete, ended: FAMILY_COPY.phase.ended,
  };
  if (!date && /\{date\}/.test(t[phase])) return phase === "canceling" ? "Gekündigt. Das Familienpaket endet am Ende der Laufzeit." : "";
  return t[phase].replace("{date}", date);
}

/** A subscription exists that can be managed in the portal (no second purchase). False for ended ones (they can be re-bought). */
export function hasSubscription(s: BillingStatus | null): boolean {
  if (!s) return false;
  const phase = billingPhase(s);
  if (phase === "ended" || phase === "none") return false;
  if (s.source === "stripe") return true;
  return !!s.subscriptionStatus;
}

/** Status badge for the subscription details (schools and families). Same words as the family badges (§4.3). */
export function billingStatusLabel(s: BillingStatus | null): { label: string; tone: Tone } {
  if (!s || (!s.subscriptionStatus && !s.status)) return { label: "Kein Abo", tone: "neutral" };
  if (!s.subscriptionStatus && s.status === "pilot") return { label: "Pilot", tone: "info" };
  const phase = billingPhase(s);
  if (phase === "none") return { label: "Kein Abo", tone: "neutral" };
  return phaseBadge(phase);
}
/** Extra line for invoice payers / cancellations, or null. */
export function billingHint(s: BillingStatus | null): string | null {
  if (!s) return null;
  if (s.cancelAtPeriodEnd) return "Das Abo ist gekündigt und läuft bis zum Ende der Laufzeit weiter.";
  if (s.collectionMethod === "send_invoice" && s.latestInvoiceStatus === "open") return `Die Rechnung ist offen. Bitte innert ${BILLING.invoiceDaysUntilDue} Tagen bezahlen.`;
  if (s.subscriptionStatus === "past_due") return "Die letzte Zahlung hat nicht geklappt. Bitte aktualisiere die Zahlungsmethode unter «Abo verwalten».";
  return null;
}

// ---------------------------------------------------------------- API errors and return pages
/** Friendly German text for a failed billing API call (status + `{ error }` code). */
export function billingErrorMessage(status: number, code?: string | null, online: boolean = onlinePaymentEnabled()): string {
  if (status === 503 && code === "price_not_found") return "Dieses Paket ist online gerade nicht verfügbar. Schreib uns über die Kontaktseite.";
  // Flag on (S7): never "noch nicht freigeschaltet", the payment is just not reachable right now.
  if (status === 503 || (status === 404 && (!code || code === "billing_disabled"))) return online ? FAMILY_COPY.api.unreachable : "Die Online-Bezahlung ist noch nicht freigeschaltet. Melde dich über die Kontaktseite, wir helfen gern weiter.";
  if (status === 404 && code === "no_customer") return "Es gibt noch kein Abo, das verwaltet werden kann.";
  if (status === 401) return "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.";
  if (status === 403) return "Das darf nur die Schuladministration bzw. ein Elternteil der Familie.";
  if (status === 409 && code === "already_subscribed") return "Es gibt bereits ein Abo. Änderungen und Verlängerung machst du unter «Abo verwalten».";
  if (status === 409) return "Dieses Paket kann gerade nicht online gebucht werden. Schreib uns über die Kontaktseite.";
  if (status === 400) return "Die Angaben sind unvollständig. Bitte lade die Seite neu und versuche es nochmals.";
  if (status === 0) return "Keine Verbindung. Prüfe deine Internetverbindung und versuche es nochmals.";
  return "Das hat nicht geklappt. Bitte versuche es in einem Moment nochmals.";
}

/** Reads `?billing=success|cancel` from a query string. */
export function readBillingReturn(search: string): BillingReturn | null {
  const v = new URLSearchParams(search).get("billing");
  return v === "success" || v === "cancel" ? v : null;
}
export const RETURN_MESSAGE: Record<BillingReturn, { tone: "success" | "info"; title: string; text: string }> = {
  success: { tone: "success", title: "Danke für deine Bestellung!", text: "Die Zahlung ist eingegangen. Die Freischaltung kann ein paar Sekunden dauern. Die Quittung kommt per E-Mail." },
  cancel: { tone: "info", title: FAMILY_COPY.return.cancelTitle, text: "Es wurde nichts belastet. Du kannst jederzeit nochmals ein Paket wählen." },
};
/** Family return notices (§3.4 / §4.3), keyed like `[data-billing-return]`. */
export type FamilyReturnState = "cancel" | "activating" | "active" | "slow";
export const FAMILY_RETURN_MESSAGE: Record<FamilyReturnState, { tone: "success" | "info" | "warning"; title: string; text: string }> = {
  cancel: { tone: "info", title: FAMILY_COPY.return.cancelTitle, text: FAMILY_COPY.return.cancelText },
  activating: { tone: "info", title: FAMILY_COPY.return.activatingTitle, text: FAMILY_COPY.return.activatingText },
  active: { tone: "success", title: FAMILY_COPY.return.activeTitle, text: FAMILY_COPY.return.activeText },
  slow: { tone: "warning", title: FAMILY_COPY.return.slowTitle, text: FAMILY_COPY.return.slowText },
};
/** `?billing=portal` = back from the Stripe customer portal (reload the status silently). */
export function isPortalReturn(search: string): boolean {
  return new URLSearchParams(search).get("billing") === "portal";
}
/** Query string without the billing return params (for history.replaceState). */
export function stripBillingParams(search: string): string {
  const q = new URLSearchParams(search);
  q.delete("billing"); q.delete("session_id");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function checkoutBody(owner: BillingOwner, plan: PlanId, payment: PaymentMethod, interval: BillingInterval = "year") {
  return owner.kind === "school" ? { plan, schoolId: owner.id, payment, interval } : { plan, familyId: owner.id, payment: "card" as const, interval };
}
export function ownerQuery(owner: BillingOwner): string {
  return owner.kind === "school" ? `schoolId=${encodeURIComponent(owner.id)}` : `familyId=${encodeURIComponent(owner.id)}`;
}

// ---------------------------------------------------------------- in-app payment (Payment Element on /familie/bezahlen)
/**
 * Pay inside the app (Stripe Checkout Session ui_mode "elements" + Payment Element in our own design) instead of the
 * hosted checkout.stripe.com page. Needs the flag ON and a publishable key; `NEXT_PUBLIC_STRIPE_CHECKOUT_UI=hosted`
 * switches back to the hosted page (fallback). Families only; schools keep the hosted page (UID, invoice address).
 * NEXT_PUBLIC_* are inlined at build time, so they are read with their literal names.
 */
export function inAppPaymentEnabled(
  env: { enabled?: boolean; publishableKey?: string; ui?: string } = {
    enabled: onlinePaymentEnabled(),
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    ui: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_UI,
  },
): boolean {
  return Boolean(env.enabled) && /^pk_(test|live)_/.test(env.publishableKey ?? "") && env.ui !== "hosted";
}

export const PAY_PATH = "/familie/bezahlen";
export const PAY_DONE_PATH = "/familie/bezahlen/fertig";

/** Link to the in-app payment page for a family. */
export function payPageHref(familyId: string, interval: BillingInterval = "year"): string {
  return `${PAY_PATH}?${new URLSearchParams({ familie: familyId, interval }).toString()}`;
}
/** `?familie=<uuid>&interval=month|year` of the payment page (null family = invalid link). */
export function readPayParams(search: string): { familyId: string | null; interval: BillingInterval } {
  const q = new URLSearchParams(search);
  const id = q.get("familie") ?? "";
  const interval = q.get("interval") === "month" ? "month" : "year";
  return { familyId: /^[0-9a-f-]{36}$/i.test(id) ? id : null, interval };
}
/** `?session_id=cs_…` on the return page. */
export function readReturnSession(search: string): string | null {
  const id = new URLSearchParams(search).get("session_id") ?? "";
  return /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id) ? id : null;
}

/** Amount for the pay button / summary, always with two decimals (Swiss format with a dot). */
export function payAmountText(plan: Plan, interval: BillingInterval): string {
  const chf = planPrice(plan, interval) ?? 0;
  return `CHF ${chf.toFixed(2)}`;
}
export const PER_INTERVAL: Record<BillingInterval, string> = { month: "pro Monat", year: "pro Jahr" };

/** German text for a failed confirm() (decline, 3DS failed, validation). Never shows Stripe's raw English codes. */
export function paymentErrorMessage(e: { code?: string | null; declineCode?: string | null; message?: string | null } | null | undefined): string {
  const decline = e?.declineCode ?? "";
  if (decline === "insufficient_funds") return "Die Karte hat nicht genug Guthaben. Versuch es mit einer anderen Karte.";
  if (decline === "expired_card") return "Die Karte ist abgelaufen. Bitte nimm eine andere Karte.";
  if (decline === "incorrect_cvc" || decline === "invalid_cvc") return "Der Sicherheitscode (CVC) stimmt nicht. Prüf ihn und versuch es nochmals.";
  if (decline === "authentication_required" || decline === "authentication_failed") return "Die Bestätigung bei deiner Bank hat nicht geklappt. Versuch es nochmals.";
  if (decline) return "Deine Bank hat die Zahlung abgelehnt. Versuch es mit einer anderen Karte oder Zahlungsart.";
  if (e?.code === "paymentFailed") return "Die Zahlung hat nicht geklappt. Es wurde nichts belastet. Versuch es nochmals.";
  if (e?.code === "validation_error" || e?.code === "incomplete") return "Bitte füll die Zahlungsangaben vollständig aus.";
  return "Die Zahlung hat nicht geklappt. Es wurde nichts belastet. Versuch es nochmals.";
}
