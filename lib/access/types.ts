// Shared contract for the access model (docs/access/SPEC.md). Pure types, safe in client, server and node tests.
// Shape of public.my_access() / public.app_access(uid) (jsonb).

export type AccessReason =
  | "school_licence" // student in a class of a licensed school, or teacher/school admin of a licensed school
  | "subscription" // own paid "solo" subscription (active, trialing, cancel_at_period_end until period end)
  | "family_subscription" // member of a family with a paid / admin-assigned family plan
  | "grant" // admin granted free access to the person (account_access.free_access_forever / free_access_until)
  | "trial" // 7-day free trial from signup
  | "grace" // payment failed (past_due): access until current_period_end + 7 days
  | "none";

export type AccessState =
  | "active" // full access (any reason except trial/grace)
  | "trial" // full access, show trial banner
  | "grace" // full access, show payment-failed banner
  | "expired" // trial/subscription over → paywall
  | "licence_required" // teacher / school admin without valid licence → /schullizenz
  | "blocked"; // blocked by WendApply admin

export type AccessRole = "student" | "parent" | "teacher" | "school_admin";

export interface AccessSubscription {
  plan: "solo" | "family";
  status: string; // Stripe status
  interval: "month" | "year" | null;
  current_period_end: string | null; // ISO
  cancel_at_period_end: boolean;
}

export interface AccessInfo {
  has_access: boolean;
  state: AccessState;
  reason: AccessReason;
  role: AccessRole;
  account_type: "school_student" | "independent_student" | "parent" | null;
  trial_ends_at: string | null; // ISO; null for teachers / school-licensed users
  trial_days_left: number | null; // ceil(days), 0 when over
  grace_until: string | null;
  grant_until: string | null; // end of a dated person grant (null when unlimited or none)
  /** Free access granted by a WendApply admin that applies now: person grant (reason "grant") or the grant of the school
   *  that gives access (reason "school_licence", only when that school has no valid licence). null = none. */
  grant: AccessGrant | null;
  subscription: AccessSubscription | null;
  /** free = the school has an active free grant from WendApply (school_access_grants). */
  school: { id: string; name: string; valid_until: string | null; free?: boolean } | null;
  blocked: boolean;
  enforced: boolean; // false = rules not active for this user yet (access_settings.enforce_mode) → UI shows no banner/paywall
  // SPEC §8 (G12, G14): why there is no access (only for state expired / licence_required, else null) …
  expired_reason: AccessExpiredReason | null;
  // … and: child in a family whose plan is not paid (yet) – waits for the parent, no prices.
  family_pending: boolean;
}

export type AccessExpiredReason =
  | "trial_ended" // 7-day trial over (also: re-signup with an e-mail whose trial was used)
  | "subscription_ended" // own solo / family subscription canceled or expired
  | "payment_failed" // past_due after the grace, or unpaid
  | "licence_ended" // linked to a school whose licence is no longer valid (students and teachers)
  | "family_pending"; // child in an unpaid family: waiting for the parent

/** "Gratis (unbefristet)" (forever) or "Gratis bis <until>". */
export interface AccessGrant {
  scope: "user" | "school";
  forever: boolean;
  until: string | null; // ISO; null when forever
}
