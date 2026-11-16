/**
 * WendApply billing catalogue – the ONE place where plans, prices and Stripe lookup keys are configured.
 * Pure TS (no imports, no Stripe SDK): safe in client and server code and in `node --experimental-strip-types` tests.
 *
 * lib/b2b/licence.ts and components/public/marketing.ts read their prices from here.
 * scripts/stripe/setup-products.mjs creates/updates the Stripe products and prices from here
 * (it parses this file, so keep each plan on the `id: '…'` / `priceChfPerYear: …` / `lookupKey: '…'` shape).
 * How to change a price: docs/billing/CATALOG.md.
 */

export type PlanId = "pilot" | "starter" | "professional" | "enterprise" | "individual" | "family";
export type PlanKind = "school" | "family";

export interface Plan {
  id: PlanId;
  kind: PlanKind;
  name: string;
  /** Yearly price in CHF, excl. VAT. 0 = free (pilot); null = contact / individual offer. */
  priceChfPerYear: number | null;
  /** Seat limit for students; null = set individually. */
  studentLimit: number | null;
  seats?: { parents: number; children: number };
  pilotDays?: number;
  maxClasses?: number;
  /** Stripe price lookup_key, e.g. 'wendapply_starter_yearly_chf'; null = no Stripe price. */
  lookupKey: string | null;
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
    priceChfPerYear: 49, // PLACEHOLDER – Panat to decide
    studentLimit: 1,
    seats: { parents: 1, children: 1 },
    lookupKey: "wendapply_family_yearly_chf",
    checkout: true,
    invoiceAllowed: false, // families: card only
    placeholder: true,
  },
};

export const BILLING = { currency: "chf", vatIncluded: false, monthlySurchargePct: 0, invoiceDaysUntilDue: 30 } as const satisfies {
  currency: "chf";
  vatIncluded: false;
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

export function planByLookupKey(key: string): Plan | undefined {
  return Object.values(PLANS).find((p) => p.lookupKey !== null && p.lookupKey === key);
}

/** "CHF 1'490" / "CHF 136.60" (Swiss thousands separator). */
export function formatChf(n: number): string {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}${cents ? `.${cents}` : ""}`;
}
