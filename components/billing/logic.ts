/**
 * Pure helpers for the billing UI (no React, no fetch): flag, plans, labels, API error texts, return messages.
 * Plain TS so `node --experimental-strip-types --test` can import it. Prices always come from lib/billing/plans.ts.
 * Swiss spelling only (ss, never the sharp s).
 */
import { BILLING, PLANS, formatChf, isStripeEnabledClient, planIntervals, planPrice, planVatIncluded, yearlySavingChf, type BillingInterval, type Plan, type PlanId } from "../../lib/billing/plans.ts";

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
export const VAT_NOTE = BILLING.vatIncluded ? "inkl. MWST" : "exkl. MWST";
/** VAT note of one plan (family = consumer price incl. VAT, schools excl. VAT). */
export const vatNote = (plan: Plan): string => (planVatIncluded(plan) ? "inkl. MWST" : "exkl. MWST");

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

/** "<formatChf> pro Jahr" (+ VAT note separately). null price = on request, 0 = free. Plans with a monthly price: both. */
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
export function priceWithVat(plan: Plan): string {
  return plan.priceChfPerYear ? `${priceText(plan)}, ${vatNote(plan)}` : priceText(plan);
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

/** A paid subscription exists (managed in the customer portal, no second purchase). */
export function hasSubscription(s: BillingStatus | null): boolean {
  if (!s) return false;
  if (s.source === "stripe") return true;
  return !!s.subscriptionStatus && !["canceled", "incomplete_expired"].includes(s.subscriptionStatus);
}

const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv", trialing: "Testphase", trial: "Testphase", pilot: "Pilot", past_due: "Zahlung überfällig", unpaid: "Unbezahlt",
  incomplete: "Zahlung ausstehend", incomplete_expired: "Abgelaufen", canceled: "Gekündigt", cancelled: "Gekündigt",
  expired: "Abgelaufen", paused: "Pausiert",
};
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const STATUS_TONE: Record<string, Tone> = {
  active: "success", trialing: "info", trial: "info", pilot: "info", past_due: "warning", unpaid: "danger", incomplete: "warning",
  incomplete_expired: "neutral", canceled: "neutral", cancelled: "neutral", expired: "danger", paused: "warning",
};
export function billingStatusLabel(s: BillingStatus | null): { label: string; tone: Tone } {
  const key = s?.subscriptionStatus ?? s?.status ?? null;
  if (!key) return { label: "Kein Abo", tone: "neutral" };
  return { label: STATUS_LABEL[key] ?? key, tone: STATUS_TONE[key] ?? "neutral" };
}
/** Extra line for invoice payers / cancellations, or null. */
export function billingHint(s: BillingStatus | null): string | null {
  if (!s) return null;
  if (s.cancelAtPeriodEnd) return "Das Abo ist gekündigt und läuft bis zum Ende der Laufzeit weiter.";
  if (s.collectionMethod === "send_invoice" && s.latestInvoiceStatus === "open") return `Die Rechnung ist offen. Bitte innert ${BILLING.invoiceDaysUntilDue} Tagen bezahlen.`;
  if (s.subscriptionStatus === "past_due") return "Die letzte Zahlung ist fehlgeschlagen. Bitte aktualisiere die Zahlungsmethode unter «Abo verwalten».";
  return null;
}

// ---------------------------------------------------------------- API errors and return pages
/** Friendly German text for a failed billing API call (status + `{ error }` code). */
export function billingErrorMessage(status: number, code?: string | null): string {
  if (status === 503 && code === "price_not_found") return "Dieses Paket ist online gerade nicht verfügbar. Schreib uns über die Kontaktseite.";
  if (status === 503 || (status === 404 && (!code || code === "billing_disabled"))) return "Die Online-Bezahlung ist noch nicht freigeschaltet. Melde dich über die Kontaktseite, wir helfen gern weiter.";
  if (status === 404 && code === "no_customer") return "Es gibt noch kein Abo, das verwaltet werden kann.";
  if (status === 401) return "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.";
  if (status === 403) return "Das darf nur die Schuladministration bzw. ein Elternteil der Familie.";
  if (status === 409 && code === "already_subscribed") return "Es gibt bereits ein Abo. Änderungen machst du unter «Abo verwalten».";
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
  cancel: { tone: "info", title: "Bezahlung abgebrochen", text: "Es wurde nichts belastet. Du kannst jederzeit nochmals ein Paket wählen." },
};
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
