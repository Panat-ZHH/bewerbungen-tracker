// Row and RPC types for the Stripe billing tables (supabase/migrations/20261116200000_billing_stripe.sql).
// Docs: docs/billing/DATA-MODEL.md. Keep in sync with the migration (tests/billing-db.test.mjs checks the SQL side).

/** Plans that can come from Stripe (pilot is never paid; individual = contact sales, created by hand in Stripe). */
export type BillingPlanId = 'starter' | 'professional' | 'enterprise' | 'individual' | 'family';

/** Stripe subscription statuses (mirrored 1:1 in billing_subscriptions.status). */
export type StripeSubscriptionStatus =
  | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

export type CollectionMethod = 'charge_automatically' | 'send_invoice';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
export type LicenceSource = 'manual' | 'pilot' | 'stripe';
export type LicencePackage = 'pilot' | 'starter' | 'professional' | 'enterprise' | 'custom' | 'family';
export type LicenceStatus = 'pilot' | 'active' | 'expired' | 'cancelled' | 'trial' | 'paused';
/** Computed usability (public._licence_state / _family_plan_state). Only 'pilot' | 'active' | 'trial' allow new joins. */
export type LicenceState = 'pilot' | 'active' | 'trial' | 'not_started' | 'expired' | 'cancelled' | 'paused';

/** Timestamps are ISO strings, dates are 'YYYY-MM-DD' (as returned by supabase-js). */
export interface BillingCustomerRow {
  id: string;
  stripe_customer_id: string; // cus_…
  school_id: string | null;   // exactly one of school_id / family_id
  family_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BillingSubscriptionRow {
  id: string;
  stripe_subscription_id: string; // sub_…
  stripe_customer_id: string;
  plan_id: BillingPlanId;
  status: StripeSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  collection_method: CollectionMethod;
  latest_invoice_status: InvoiceStatus | null;
  school_id: string | null;
  family_id: string | null;
  licence_id: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

/** service role only (RLS without policy). */
export interface StripeEventRow {
  id: string; // evt_…
  type: string;
  received_at: string;
  processed_at: string | null;
}

/** The billing-relevant columns of public.school_licences (the table has more; see docs/b2b/DATA-MODEL.md). */
export interface LicenceBillingColumns {
  id: string;
  school_id: string | null;
  family_id: string | null;
  package: LicencePackage;
  status: LicenceStatus;
  student_limit: number;
  valid_from: string | null;
  valid_until: string | null;
  source: LicenceSource;
  stripe_subscription_id: string | null; // service role only (not in the authenticated column grant)
}

/**
 * Named parameters of public.billing_apply_subscription (supabase-js: `admin.rpc('billing_apply_subscription', params)`
 * with the SERVICE ROLE client). Send the full current subscription state on every event; the call is idempotent.
 */
export interface BillingApplySubscriptionParams {
  p_stripe_customer_id: string;
  p_stripe_subscription_id: string;
  p_plan_id: BillingPlanId;
  p_status: StripeSubscriptionStatus;
  p_current_period_end: string | null;
  p_current_period_start?: string | null;
  p_cancel_at_period_end?: boolean;
  p_collection_method?: CollectionMethod;
  p_latest_invoice_status?: InvoiceStatus | null;
  /** Required the first time a customer is seen (exactly one); afterwards optional but must match. */
  p_school_id?: string | null;
  p_family_id?: string | null;
  p_created_by?: string | null;
  /** Only for plan 'individual' (otherwise the package default: 100 / 300 / 800). */
  p_student_limit?: number | null;
  /** Stripe event id/type/created: duplicate and out-of-order protection. */
  p_event_id?: string | null;
  p_event_type?: string | null;
  p_event_created?: string | null;
}

export type BillingApplySkipReason = 'duplicate_event' | 'stale_event' | 'owner_not_found';

export interface BillingApplySubscriptionResult {
  applied: boolean;
  reason?: BillingApplySkipReason;
  subscription_id?: string;
  licence_id?: string | null;
  licence_status?: LicenceStatus | null;
}

/** Error messages raised by billing_apply_subscription (supabase-js error.message). */
export type BillingApplyError =
  | 'FORBIDDEN' | 'INVALID_REQUEST' | 'INVALID_PLAN' | 'INVALID_STATUS'
  | 'BILLING_OWNER_REQUIRED' | 'BILLING_OWNER_MISMATCH' | 'LICENCE_LIMIT_REQUIRED';

/** Shared part of billing_status_for_school / billing_status_for_family (all null when there is no licence). */
export interface BillingStatusBase {
  /** Licence package as plan id ('custom' is reported as 'individual'); 'pilot' for pilots. */
  plan: 'pilot' | BillingPlanId | null;
  state: LicenceState | null;
  licence_status: LicenceStatus | null;
  source: LicenceSource | null;
  student_limit: number | null;
  /** pilot_end for pilots, trial end (Zurich date) for family trials, else valid_until. */
  valid_until: string | null;
  subscription_status: StripeSubscriptionStatus | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  collection_method: CollectionMethod | null;
  latest_invoice_status: InvoiceStatus | null;
  has_customer: boolean;
}

export interface BillingStatusForSchool extends BillingStatusBase {
  school_id: string;
  students_used: number;
}

export interface BillingStatusForFamily extends BillingStatusBase {
  family_id: string;
}

/** RPC params: `rpc('billing_status_for_school', { p_school_id })` / `rpc('billing_status_for_family', { p_family_id })`. */
export interface BillingStatusForSchoolParams { p_school_id: string }
export interface BillingStatusForFamilyParams { p_family_id: string }
