/**
 * Types of the B2B data layer (supabase/migrations/20261116*_b2b_*.sql). Pure types, no runtime code.
 * Contract and call examples: docs/b2b/DATA-MODEL.md. JSON keys are snake_case exactly as the RPCs return them.
 */

export type Country = "CH" | "DE" | "AT";
export type LicencePackage = "pilot" | "starter" | "professional" | "enterprise" | "custom";
/** Stored status (set manually by the platform admin). */
export type LicenceStatus = "pilot" | "active" | "expired" | "cancelled";
/** Effective state today, computed by public._licence_state (and licenceState() in lib/b2b/licence.ts). */
export type LicenceState = "pilot" | "active" | "not_started" | "expired" | "cancelled";
export type BillingInterval = "yearly" | "monthly";
export type UserRole = "student" | "teacher" | "school_admin";

export type School = { id: string; name: string; canton_or_state: string; country: Country };

/** Row of public.school_licences (dates as YYYY-MM-DD strings). */
export type SchoolLicenceRow = {
  id: string;
  school_id: string;
  package: LicencePackage;
  student_limit: number;
  status: LicenceStatus;
  pilot_start: string | null;
  pilot_end: string | null;
  valid_from: string | null;
  valid_until: string | null;
  billing_interval: BillingInterval;
  notes: string | null;
  created_at: string;
};

/** Licence summary as returned inside school_admin_my_schools / school_admin_overview / class_school_info. */
export type LicenceSummary = {
  id: string;
  package: LicencePackage;
  status: LicenceStatus;
  state: LicenceState;
  student_limit: number;
  students_used: number;
  seats_left: number;
  pilot_start: string | null;
  pilot_end: string | null;
  valid_from: string | null;
  valid_until: string | null;
  billing_interval: BillingInterval;
  /** Days until pilot_end (pilot) or valid_until; negative when over; null when open-ended. */
  days_left: number | null;
};

/** rpc("school_admin_my_schools") row. */
export type AdminSchool = { school_id: string; name: string; canton_or_state: string; country: Country; licence: LicenceSummary | null };

/** Aggregates of sharing students. Numbers are null when suppressed (fewer than 3 sharing students). */
export type SchoolAggregate = {
  students_sharing: number;
  suppressed: boolean;
  applications: number | null;
  students_with_application: number | null;
  students_placed: number | null;
  students_active_14d: number | null;
};

/** rpc("school_admin_overview", { p_school_id }) */
export type SchoolAdminOverview = {
  school: School;
  licence: LicenceSummary | null;
  totals: SchoolAggregate & { classes: number; archived_classes: number; teachers: number; students: number };
  classes: (SchoolAggregate & { id: string; name: string; school_year: string; archived: boolean; teacher_name: string | null; students: number })[];
  teachers: { teacher_id: string; display_name: string; classes: number }[];
};

/** rpc("school_attach_class", { p_school_id, p_join_code }) row. */
export type AttachedClass = { class_id: string; name: string; students: number };

/** rpc("class_school_info", { p_class_id }) */
export type ClassSchoolInfo = { school: School | null; licence: LicenceSummary | null };

// ---------- class goals ----------
export type GoalMetric = "applications_sent" | "interviews" | "trial_days" | "custom";

/** Row of public.class_goals (teachers insert/update/delete it directly; RLS checks the class). target = per student. */
export type ClassGoal = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  metric: GoalMetric;
  target: number | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
};

/** rpc("class_goal_progress", { p_class_id }) row. Aggregates only; numbers null for custom goals or when suppressed. */
export type ClassGoalProgress = {
  goal_id: string;
  title: string;
  description: string | null;
  metric: GoalMetric;
  target: number | null;
  due_date: string | null;
  created_at: string;
  students_total: number;
  students_counted: number;
  students_reached: number | null;
  total_value: number | null;
  average_value: number | null;
  suppressed: boolean;
};

// ---------- class statistics ----------
export type SupportReason = "self_report" | "no_application" | "no_activity" | "upcoming_deadline" | "many_rejections";

export type ClassStatsStudent = {
  student_id: string;
  display_name: string;
  alias: string | null;
  avatar_seed: string;
  joined_at: string;
  /** true = the student shares nothing ("Fortschritt teilen" off): only name + self_report reason. */
  hidden: boolean;
  share_status: boolean;
  applications: number | null;
  status_counts: Record<string, number> | null;
  last_activity: string | null;
  placed: boolean;
  needs_support: boolean;
  reasons: SupportReason[];
};

/** rpc("class_overview_stats", { p_class_id, p_inactive_days? }) */
export type ClassOverviewStats = {
  class_id: string;
  generated_at: string;
  inactive_days: number;
  totals: {
    students: number;
    students_sharing: number;
    students_sharing_status: number;
    applications: number;
    status_counts: Record<string, number>;
    students_with_application: number;
    students_placed: number;
    students_active: number;
    needs_support: number;
    reasons: Record<SupportReason, number>;
  };
  students: ClassStatsStudent[];
};

// ---------- data subject rights ----------
/** rpc("export_my_data"): every own row per table (credentials redacted) plus readable context. */
export type MyDataExport = {
  format: "wendapply-export-v1";
  exported_at: string;
  account: { id: string; email: string | null };
  friends: { display_name: string; status: string; since: string }[];
  classes: { class: string; school_year: string; teacher: string | null; school: string | null; joined_at: string; share_applications: boolean; share_status: boolean; share_companies: boolean }[];
  tables: Record<string, Record<string, unknown>[]>;
};

/** Licence errors raised by the class_members / classes triggers (supabase-js: error.code / error.message / error.details). */
export type LicenceErrorCode = "LICENCE_LIMIT_REACHED" | "LICENCE_EXPIRED" | "LICENCE_MISSING";
