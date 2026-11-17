// SERVER ONLY: wires the pure billing logic (api.ts, webhook.ts) to Supabase (service role) and Stripe.
// The service role key is read here and nowhere else in billing; it never reaches the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isStripeEnabled } from "./plans.ts";
import { supabaseAuthDeps, type BillingOwner } from "./auth.ts";
import { apiStripe, getStripe, isLiveMode, isStripeConfigured, webhookStripe } from "./stripe.ts";
import { sharedMemoryBillingDb } from "./memory-db.ts";
import { safeBaseUrl, type BillingApiDb, type BillingApiDeps } from "./api.ts";
import type { BillingDb, WebhookDeps } from "./webhook.ts";
import type { BillingApplySubscriptionResult } from "./db-types.ts";

export const NO_STORE = { "Cache-Control": "no-store" };

const log = (message: string, extra?: Record<string, unknown>) => console.info(message, extra ? JSON.stringify(extra) : "");

/** BILLING_DB=memory: in-memory writer for local webhook tests. Refused in production builds on Netlify's prod context. */
export function memoryDbEnabled(): boolean {
  if (process.env.BILLING_DB !== "memory") return false;
  if (process.env.CONTEXT === "production") throw new Error("BILLING_DB=memory is not allowed in production");
  return true;
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function supabaseBillingDb(admin: SupabaseClient = serviceClient()): BillingDb {
  return {
    async isEventProcessed(id) {
      const { data, error } = await admin.from("stripe_events").select("processed_at").eq("id", id).maybeSingle();
      if (error) throw new Error(`DB_READ_FAILED:${error.code ?? ""}`);
      return Boolean(data?.processed_at);
    },
    async markEventProcessed(id, type) {
      const { error } = await admin.from("stripe_events").upsert({ id, type, processed_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw new Error(`DB_WRITE_FAILED:${error.code ?? ""}`);
    },
    async applySubscription(params) {
      const { data, error } = await admin.rpc("billing_apply_subscription", params);
      if (error) throw new Error(error.message || `DB_RPC_FAILED:${error.code ?? ""}`);
      return data as BillingApplySubscriptionResult;
    },
  };
}

/** Subscription statuses that block a second checkout (the existing one is managed in the portal). */
export const OPEN_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"];

export interface CustomerRow { stripe_customer_id: string; created_by: string | null }

/**
 * Family customer the caller may use (rows newest first): the caller's own, else one created by another parent who is
 * still active in the family. Never one whose creator left / deleted the account (created_by null): that customer holds
 * the former parent's card, address and invoices (reaudit 2026-11-17).
 */
export function pickFamilyCustomer(rows: CustomerRow[], userId: string, activeParents: string[]): string | null {
  const own = rows.find((r) => r.created_by === userId);
  if (own) return own.stripe_customer_id;
  return rows.find((r) => r.created_by !== null && activeParents.includes(r.created_by))?.stripe_customer_id ?? null;
}

const ownerCol = (owner: BillingOwner) => (owner.kind === "school" ? "school_id" : "family_id");

export function supabaseApiDb(admin: SupabaseClient = serviceClient()): BillingApiDb {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return {
    async findCustomerId(owner, userId) {
      const { data, error } = await admin.from("billing_customers").select("stripe_customer_id, created_by").eq(ownerCol(owner), owner.id)
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw new Error(`DB_READ_FAILED:${error.code ?? ""}`);
      const rows = (data ?? []) as CustomerRow[];
      if (owner.kind === "school") return rows[0]?.stripe_customer_id ?? null;
      const { data: parents, error: e2 } = await admin.from("family_members").select("user_id")
        .eq("family_id", owner.id).eq("role", "parent").eq("status", "active");
      if (e2) throw new Error(`DB_READ_FAILED:${e2.code ?? ""}`);
      return pickFamilyCustomer(rows, userId, ((parents ?? []) as { user_id: string }[]).map((p) => p.user_id));
    },
    async saveCustomer(owner, customerId, userId) {
      const { error } = await admin.from("billing_customers")
        .upsert({ stripe_customer_id: customerId, [ownerCol(owner)]: owner.id, created_by: userId }, { onConflict: "stripe_customer_id", ignoreDuplicates: true });
      if (error) throw new Error(`DB_WRITE_FAILED:${error.code ?? ""}`);
    },
    async hasOpenSubscription(owner) {
      const { data, error } = await admin.from("billing_subscriptions").select("id").eq(ownerCol(owner), owner.id)
        .in("status", OPEN_SUBSCRIPTION_STATUSES).limit(1); // cancel_at_period_end rows count too (renew in the portal)
      if (error) throw new Error(`DB_READ_FAILED:${error.code ?? ""}`);
      return (data ?? []).length > 0;
    },
    async ownerName(owner) {
      const { data } = await admin.from(owner.kind === "school" ? "schools" : "families").select("name").eq("id", owner.id).maybeSingle();
      return (data as { name?: string } | null)?.name ?? null;
    },
    async status(owner, token) {
      // With the caller's token: the DB checks admin/parent again (defence in depth).
      const user = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      const fn = owner.kind === "school" ? "billing_status_for_school" : "billing_status_for_family";
      const { data, error } = await user.rpc(fn, owner.kind === "school" ? { p_school_id: owner.id } : { p_family_id: owner.id });
      if (error) throw new Error(`DB_RPC_FAILED:${error.code ?? ""}`);
      return data;
    },
  };
}

export function webhookDeps(): WebhookDeps {
  return { db: memoryDbEnabled() ? sharedMemoryBillingDb() : supabaseBillingDb(), stripe: webhookStripe(getStripe()), log };
}

export function apiDeps(request: Request): BillingApiDeps {
  const enabled = isStripeEnabled();
  const configured = isStripeConfigured() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const extraHosts = (process.env.BILLING_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const base = safeBaseUrl([process.env.APP_URL, process.env.URL, new URL(request.url).origin], extraHosts);
  // Clients are built on first use only, so a disabled/unconfigured server never needs the keys.
  const lazy = <T extends object>(make: () => T): T => {
    let made: T | undefined;
    return new Proxy({} as T, { get: (_t, prop) => Reflect.get((made ??= make()), prop) });
  };
  return {
    enabled, configured, liveMode: isLiveMode(), baseUrl: base, log,
    auth: lazy(() => supabaseAuthDeps(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)),
    stripe: lazy(() => apiStripe(getStripe())),
    db: lazy(() => supabaseApiDb()),
  };
}

/** Maps thrown errors to a generic 500 without leaking details (the message is logged without secrets). */
export function serverError(where: string, error: unknown) {
  console.error(`billing ${where} failed`, error instanceof Error ? error.message.split(":")[0].slice(0, 120) : "unknown");
  return Response.json({ error: "billing_failed" }, { status: 500, headers: NO_STORE });
}
