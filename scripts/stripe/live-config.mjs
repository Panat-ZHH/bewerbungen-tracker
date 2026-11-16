// Shared constants for scripts/stripe/live-setup.mjs (keep in sync with lib/billing/stripe.ts and docs/billing/GO-LIVE.md).
export const STRIPE_API_VERSION_FOR_SCRIPTS = "2026-10-28.endive"; // = STRIPE_API_VERSION in lib/billing/stripe.ts
export const WEBHOOK_URL = "https://wendapply.ch/api/stripe/webhook";
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];
