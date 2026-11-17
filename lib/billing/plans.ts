/**
 * WendApply billing catalogue – the ONE place where plans, prices and Stripe lookup keys are configured.
 * Pure TS (no imports, no Stripe SDK): safe in client and server code and in `node --experimental-strip-types` tests.
 *
 * lib/b2b/licence.ts and components/public/marketing.ts read their prices from here.
 * scripts/stripe/setup-products.mjs creates/updates the Stripe products and prices from here
 * (it parses this file, so keep each plan on the `id: '…'` / `priceChfPerYear: …` / `lookupKey: '…'` shape).
 * How to change a price: docs/billing/CATALOG.md.
 */

export type PlanId = "pilot" | "starter" | "professional" | "enterprise" | "individual" | "family" | "solo";
/** Who owns / buys a plan: a school, a family (parents), or one user ("individual": the solo plan, owner = the student). */
export type PlanKind = "school" | "family" | "individual";
/** Billing interval of a Stripe price. Every paid plan has a yearly price; some (family, solo) also a monthly one. */
export type BillingInterval = "year" | "month";

export interface Plan {
  id: PlanId;
  kind: PlanKind;
  name: string;
  /** Yearly price in CHF (final price, no VAT: WendApply is not VAT-registered). 0 = free (pilot); null = contact / individual offer. */
  priceChfPerYear: number | null;
  /** Seat limit for students; null = set individually. */
  studentLimit: number | null;
  seats?: { parents: number; children: number };
  pilotDays?: number;
  maxClasses?: number;
  /** Stripe price lookup_key of the yearly price, e.g. 'wendapply_starter_yearly_chf'; null = no Stripe price. */
  lookupKey: string | null;
  /** Monthly price in CHF (final price). Unset = yearly only. */
  priceChfPerMonth?: number;
  /** Stripe lookup_key of the monthly price, e.g. 'wendapply_family_monthly_chf'. Set together with priceChfPerMonth. */
  lookupKeyMonthly?: string;
  /** Can be bought by card via Stripe Checkout. */
  checkout: boolean;
  /** Can be paid by invoice (Stripe Invoicing, send_invoice). */
  invoiceAllowed: boolean;
  /** true = amount not decided yet, must not be sold live. */
  placeholder?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  pilot: { id: "pilot", kind: "school", name: "Pilot", priceChfPerYear: 0, studentLimit: 60, pilotDays: 30, maxClasses: 2, lookupKey: null, checkout: false, invoiceAllowed: false },
  starter: { id: "starter", kind: "school", name: "Starter", priceChfPerYear: 990, studentLimit: 100, lookupKey: "wendapply_starter_yearly_chf", checkout: true, invoiceAllowed: true },
  professional: { id: "professional", kind: "school", name: "Professional", priceChfPerYear: 1490, studentLimit: 300, lookupKey: "wendapply_professional_yearly_chf", checkout: true, invoiceAllowed: true },
  enterprise: { id: "enterprise", kind: "school", name: "Enterprise", priceChfPerYear: 3990, studentLimit: 800, lookupKey: "wendapply_enterprise_yearly_chf", checkout: true, invoiceAllowed: true },
  individual: { id: "individual", kind: "school", name: "Individuell", priceChfPerYear: null, studentLimit: null, lookupKey: null, checkout: false, invoiceAllowed: false },
  family: {
    id: "family",
    kind: "family",
    name: "Familienpaket",
    // Decided by Panat 2026-11-16: CHF 7.90 per month or CHF 79 per year (saves CHF 15.80 vs 12 x 7.90).
    priceChfPerYear: 79,
    priceChfPerMonth: 7.9,
    studentLimit: 1,
    seats: { parents: 1, children: 1 },
    lookupKey: "wendapply_family_yearly_chf",
    lookupKeyMonthly: "wendapply_family_monthly_chf",
    checkout: true,
    invoiceAllowed: false, // families: card only
    // No family trial any more (access model 2026-11-17): every user gets the 7-day trial from signup instead.
  },
  solo: {
    id: "solo",
    kind: "individual",
    name: "Einzelabo",
    // Decided 2026-11-17 (docs/access/SPEC.md §2): CHF 4.90 per month or CHF 49 per year, one student, card only, no VAT.
    // Note: "individual" (above) is the SCHOOL offer "Individuell" – unrelated to this plan.
    priceChfPerYear: 49,
    priceChfPerMonth: 4.9,
    studentLimit: 1,
    lookupKey: "wendapply_solo_yearly_chf",
    lookupKeyMonthly: "wendapply_solo_monthly_chf",
    checkout: true,
    invoiceAllowed: false, // card only
  },
};

/**
 * vatRegistered: false – decided by Panat 2026-11-16: WendApply/Wendico is not MWST-registered, so no VAT is charged or
 * shown ("CHF 7.90 pro Monat", no "inkl./exkl. MWST"). Stripe prices have no tax_behavior, no Stripe Tax, Managed Payments off.
 * If VAT registration ever becomes necessary (turnover > CHF 100'000), this is the switch to revisit (copy + Stripe tax).
 */
export const BILLING = { currency: "chf", vatRegistered: false, monthlySurchargePct: 0, invoiceDaysUntilDue: 30 } as const satisfies {
  currency: "chf";
  vatRegistered: false;
  monthlySurchargePct: 0;
  invoiceDaysUntilDue: 30;
};

/** Plans that have a Stripe price (lookupKey set), in catalogue order. */
export const STRIPE_PLANS: Plan[] = Object.values(PLANS).filter((p) => p.lookupKey !== null);

/** Server-side feature flag. Default OFF. */
export function isStripeEnabled(): boolean {
  return typeof process !== "undefined" && process.env.STRIPE_ENABLED === "true";
}

/** Client-side feature flag (inlined by Next.js at build time). Default OFF. */
export function isStripeEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true";
}

/** Maps a Stripe price lookup_key (yearly or monthly) back to its plan. */
export function planByLookupKey(key: string): Plan | undefined {
  if (!key) return undefined;
  return Object.values(PLANS).find((p) => (p.lookupKey !== null && p.lookupKey === key) || p.lookupKeyMonthly === key);
}

/** Intervals a plan can be bought in: always "year" for Stripe plans, plus "month" when a monthly price exists. */
export function planIntervals(plan: Plan): BillingInterval[] {
  if (!plan.lookupKey) return [];
  return plan.lookupKeyMonthly && plan.priceChfPerMonth ? ["year", "month"] : ["year"];
}

/** Stripe lookup_key for a plan + interval, or null when the plan has no such price. */
export function lookupKeyFor(plan: Plan, interval: BillingInterval = "year"): string | null {
  if (interval === "month") return plan.lookupKeyMonthly && plan.priceChfPerMonth ? plan.lookupKeyMonthly : null;
  return plan.lookupKey;
}

/** Price in CHF for a plan + interval (null = no such price / on request). */
export function planPrice(plan: Plan, interval: BillingInterval = "year"): number | null {
  return interval === "month" ? plan.priceChfPerMonth ?? null : plan.priceChfPerYear;
}

/** The minimal Stripe Price fields the catalogue check needs (Stripe.Price is assignable). */
export interface PriceShape {
  active?: boolean;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
}

/**
 * Price integrity (re-audit 2 2026-11-17): the Stripe price found by lookup_key must be exactly what the app shows and the
 * payer consents to ("CHF 7.90 pro Monat … automatisch abzubuchen"): same amount in Rappen, CHF, recurring with the same
 * interval, every 1 interval. A price created by hand in the Dashboard, a lookup key transferred to the wrong price or a
 * plans.ts change deployed before scripts/stripe/setup-products.mjs ran must never be charged.
 */
export function priceMatchesCatalogue(price: PriceShape | null | undefined, lookupKey: string): boolean {
  const plan = planByLookupKey(lookupKey);
  if (!plan || !price) return false;
  const interval: BillingInterval = plan.lookupKeyMonthly === lookupKey ? "month" : "year";
  const chf = planPrice(plan, interval);
  if (chf === null || chf <= 0) return false;
  return price.active !== false
    && (price.currency ?? "").toLowerCase() === BILLING.currency
    && price.unit_amount === Math.round(chf * 100)
    && (price.type == null || price.type === "recurring")
    && price.recurring?.interval === interval
    && (price.recurring?.interval_count ?? 1) === 1;
}

/** CHF saved per year by paying yearly instead of 12 monthly payments (0 if there is no monthly price). */
export function yearlySavingChf(plan: Plan): number {
  if (!plan.priceChfPerMonth || !plan.priceChfPerYear) return 0;
  return Math.max(0, Math.round((plan.priceChfPerMonth * 12 - plan.priceChfPerYear) * 100) / 100);
}

/** "CHF 1'490" / "CHF 136.60" (Swiss thousands separator). */
export function formatChf(n: number): string {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}${cents ? `.${cents}` : ""}`;
}
