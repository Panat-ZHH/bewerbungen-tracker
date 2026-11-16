// SERVER ONLY: the Stripe SDK client. Never import this from a client component (it reads STRIPE_SECRET_KEY).
// Prices are always found by lookup key (lib/billing/plans.ts), never by hard-coded price_… ids.
import Stripe from "stripe";
import type { WebhookStripe } from "./webhook.ts";
import type { BillingApiStripe } from "./api.ts";

/** Pinned so a Stripe SDK upgrade never silently changes payload shapes (webhook.ts reads period/parent fields of this version). */
export const STRIPE_API_VERSION = "2026-10-28.endive" as const;

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  // STRIPE_ACCOUNT_ID: only for local runs with the Stripe CLI's OAuth token (sent as Stripe-Account header). Leave unset with sk_ keys.
  if (!client) client = new Stripe(key, { apiVersion: STRIPE_API_VERSION, appInfo: { name: "WendApply" }, maxNetworkRetries: 2, stripeAccount: process.env.STRIPE_ACCOUNT_ID || undefined });
  return client;
}

export const isStripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
/** Live key in use (sk_live_/rk_live_)? Placeholder plans are never sold live. */
export const isLiveMode = () => /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

/** Signature check for the webhook route (throws on a bad signature or a too old timestamp). */
export function verifyStripeEvent(rawBody: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export function webhookStripe(stripe: Stripe = getStripe()): WebhookStripe {
  return { retrieveSubscription: (id) => stripe.subscriptions.retrieve(id, { expand: ["latest_invoice"] }) };
}

const priceCache = new Map<string, { id: string; at: number }>();

export function apiStripe(stripe: Stripe = getStripe()): BillingApiStripe {
  return {
    async priceIdForLookupKey(key) {
      const hit = priceCache.get(key);
      if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
      const { data } = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
      const id = data[0]?.id ?? null;
      if (id) priceCache.set(key, { id, at: Date.now() });
      return id;
    },
    async createCustomer({ email, name, metadata }) {
      const customer = await stripe.customers.create({ email: email ?? undefined, name: name ?? undefined, metadata, preferred_locales: ["de-CH", "de"] });
      return customer.id;
    },
    async createCheckoutSession(p) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: p.customer,
        line_items: [{ price: p.price, quantity: 1 }],
        client_reference_id: p.metadata.user_id,
        metadata: p.metadata,
        subscription_data: { metadata: p.metadata },
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        locale: "de",
        billing_address_collection: "required",
        customer_update: { name: "auto", address: "auto" },
        tax_id_collection: p.kind === "school" ? { enabled: true } : undefined,
        // The account has Stripe "Managed Payments" (Stripe as merchant of record) on by default, which rejects products
        // without a tax code. WendApply sells itself, prices excl. MWST (plans.ts BILLING) => off per session.
        // Decision for Panat before go-live, see docs/billing/WEBHOOK-TEST.md.
        managed_payments: { enabled: false },
      });
      return { url: session.url ?? null };
    },
    async createInvoiceSubscription(p) {
      const sub = await stripe.subscriptions.create({
        customer: p.customer,
        items: [{ price: p.price, quantity: 1 }],
        collection_method: "send_invoice",
        days_until_due: p.daysUntilDue,
        metadata: p.metadata,
      });
      // The first invoice of a send_invoice subscription starts as a draft (auto-finalised after ~1 h). Finalise it now
      // so the admin gets the hosted invoice page (PDF, bank details / QR-bill if enabled on the account) right away.
      const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
      let hostedInvoiceUrl: string | null = null;
      if (invoiceId) {
        let invoice = await stripe.invoices.retrieve(invoiceId);
        if (invoice.status === "draft") invoice = await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: true });
        if (invoice.status === "open") {
          try { invoice = await stripe.invoices.sendInvoice(invoiceId); } catch { /* e-mail delivery is best effort; the link still works */ }
        }
        hostedInvoiceUrl = invoice.hosted_invoice_url ?? null;
      }
      return { subscriptionId: sub.id, hostedInvoiceUrl };
    },
    async createPortalSession({ customer, returnUrl }) {
      const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID || undefined;
      const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl, configuration, locale: "de" });
      return { url: session.url };
    },
  };
}
