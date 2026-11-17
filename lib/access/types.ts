// Shared contract for the access model (docs/access/SPEC.md). Pure types, safe in client, server and node tests.
// Shape of public.my_access() / public.app_access(uid) (jsonb).

export type AccessReason =
  | "school_licence" // student in a class of a licensed school, or teacher/school admin of a licensed school
  | "subscription" // own paid "solo" subscription (active, trialing, cancel_at_period_end until period end)
  | "family_subscription" // member of a family with a paid / admin-assigned family plan
  | "grant" // admin granted free access (account_access.free_access_until)
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
  grant_until: string | null;
  subscription: AccessSubscription | null;
  school: { id: string; name: string; valid_until: string | null } | null;
  blocked: boolean;
}
