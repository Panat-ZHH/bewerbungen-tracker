// Pure rules of the /abo page (unit tested in tests/access-ui-billing.test.mjs).
import { hidesPrices, isStaff } from "@/lib/access/gate";
import type { AccessInfo } from "@/lib/access/types";

/** Stripe statuses of a subscription that still renews. */
export const RENEWING = ["active", "trialing", "past_due"];

/** Which block /abo shows. */
export type AboMode = "loading" | "staff" | "free" | "licensed" | "family_pending" | "family_covered" | "solo_active" | "parent" | "student";
export function aboMode(access: AccessInfo | null): AboMode {
  if (!access) return "loading";
  if (isStaff(access)) return "staff";
  // Free access granted by WendApply (person): no prices, no upsell.
  if (access.reason === "grant" && access.has_access) return "free";
  if (hidesPrices(access)) return "licensed";
  if (access.family_pending || access.expired_reason === "family_pending") return "family_pending";
  if (access.subscription?.plan === "solo" && RENEWING.includes(access.subscription.status)) return "solo_active";
  if (access.reason === "family_subscription") return "family_covered";
  if (access.account_type === "parent") return "parent";
  return "student";
}

/** Own Einzelabo still renews although school / family already cover the student (FLOW G15). */
export function paysTwice(access: AccessInfo | null): boolean {
  const sub = access?.subscription;
  return !!access && !!sub && sub.plan === "solo" && RENEWING.includes(sub.status) && !sub.cancel_at_period_end && (access.reason === "school_licence" || access.reason === "family_subscription");
}
