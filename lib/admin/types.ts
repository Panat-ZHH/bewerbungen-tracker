// Shapes of the platform admin API (/api/admin/*, docs/access/ADMIN.md). Pure types: safe in client, server and node tests.
import type { AccessInfo } from "../access/types.ts";

export type AdminRole = "student" | "teacher" | "school_admin" | "parent" | "unknown";

export interface AdminSubscription {
  id: string; // sub_…
  customer: string; // cus_…
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  owner: "user" | "family" | "school";
  stripe_url: string; // Stripe dashboard link (test/ prefix outside live mode)
  customer_url: string;
}

export interface AdminSchoolRef { id: string; name: string; via: "class" | "admin" | "teacher" }

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: AdminRole;
  account_type: string | null;
  schools: AdminSchoolRef[];
  created_at: string | null;
  last_sign_in_at: string | null;
  trial_ends_at: string | null;
  free_access_until: string | null;
  /** Unlimited free access ("Gratis (unbefristet)"). */
  free_access_forever: boolean;
  blocked: boolean;
  access_state: AccessInfo["state"] | null; // null = app_access() unavailable
  access_reason: AccessInfo["reason"] | null;
  subscription: AdminSubscription | null; // most relevant (open first)
  mfa: boolean;
}

export interface AccountAccessRow {
  user_id: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  free_access_until: string | null;
  free_access_note: string | null;
  free_access_forever?: boolean;
  free_access_granted_at?: string | null;
  free_access_granted_by?: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  enforce_test?: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  admin_id: string | null;
  admin_email?: string | null;
  action: string;
  target_user: string | null;
  target_school: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

export interface AdminUserDetail extends AdminUserRow {
  access: AccessInfo | null;
  account_access: AccountAccessRow | null;
  subscriptions: AdminSubscription[];
  families: { id: string; name: string; role: string; status: string }[];
  classes: { id: string; name: string; school_id: string | null; as: "student" | "teacher" }[];
  platform_admin: boolean;
  audit: AuditEntry[];
}

export interface SchoolLicence {
  id: string;
  package: string;
  status: string;
  state: string; // _licence_state: pilot | active | not_started | expired | cancelled
  student_limit: number;
  pilot_start: string | null;
  pilot_end: string | null;
  valid_from: string | null;
  valid_until: string | null;
  billing_interval: string;
  notes: string | null;
  created_at: string;
}

/** Free access for a whole school (public.school_access_grants): forever, or until a point in time. */
export interface SchoolFreeAccess {
  forever: boolean;
  until: string | null;
  note: string | null;
  granted_by: string | null;
  granted_at: string | null;
}

export interface AdminSchoolRow {
  id: string;
  name: string;
  canton_or_state: string;
  country: string;
  created_at: string;
  licence: SchoolLicence | null; // current licence (usable first, else newest)
  /** Free access grant of the school (may be expired: check until), null = none. */
  free_access?: SchoolFreeAccess | null;
  students: number;
  admins: number;
  teachers: number;
}

export interface AdminSchoolPerson { user_id: string; email: string | null; name: string | null; created_at: string | null }

export interface AdminSchoolDetail extends AdminSchoolRow {
  licences: SchoolLicence[];
  admin_users: AdminSchoolPerson[];
  teacher_users: AdminSchoolPerson[];
  classes: { id: string; name: string; teacher_id: string; archived: boolean; students: number }[];
  audit: AuditEntry[];
}

export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }

export interface AdminMe {
  user_id: string;
  email: string | null;
  /** "aal2" = TOTP verified in this session; "aal1" = Google login of an admin without an enrolled TOTP factor. */
  aal: "aal1" | "aal2";
  /** How this session passed the admin gate. */
  auth: "totp" | "google";
  /** A verified TOTP factor exists (recommend enrolment when false). */
  mfa_enrolled: boolean;
}

export interface SignupStats { days: 7 | 30; total: number; by_day: { day: string; count: number }[]; users: AdminUserRow[] }

/** Error codes returned by the API (generic on purpose: never internals). */
export type AdminErrorCode =
  | "unauthenticated" | "not_found" | "mfa_required" | "rate_limited" | "invalid_input" | "confirm_required"
  | "conflict" | "subscription_active" | "failed" | "not_configured";
