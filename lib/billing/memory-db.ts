// In-memory BillingDb for local webhook tests (BILLING_DB=memory, never in production): lets `stripe listen` +
// `stripe trigger` exercise the real route without touching any Supabase project. Mimics the duplicate / stale-event
// rules of billing_apply_subscription closely enough for the manual run (docs/billing/WEBHOOK-TEST.md).
import type { BillingDb } from "./webhook.ts";
import type { BillingApplySubscriptionParams, BillingApplySubscriptionResult } from "./db-types.ts";

export interface MemoryBillingState {
  events: Map<string, { type: string; processedAt: string | null }>;
  subscriptions: Map<string, BillingApplySubscriptionParams & { lastEventAt: string | null }>;
  calls: BillingApplySubscriptionParams[];
}

const ACTIVE = ["active", "trialing", "past_due", "canceled"];

export function createMemoryBillingDb(state: MemoryBillingState = { events: new Map(), subscriptions: new Map(), calls: [] }): BillingDb & { state: MemoryBillingState } {
  const done = (id: string | null | undefined, type: string) => { if (id) state.events.set(id, { type, processedAt: new Date().toISOString() }); };
  return {
    state,
    async isEventProcessed(id) { return Boolean(state.events.get(id)?.processedAt); },
    async markEventProcessed(id, type) { done(id, type); },
    async applySubscription(p): Promise<BillingApplySubscriptionResult> {
      state.calls.push(p);
      if (p.p_event_id && state.events.get(p.p_event_id)?.processedAt) return { applied: false, reason: "duplicate_event" };
      const prev = state.subscriptions.get(p.p_stripe_subscription_id);
      if (!prev && !p.p_school_id && !p.p_family_id) throw new Error("BILLING_OWNER_REQUIRED");
      if (prev && p.p_event_created && prev.lastEventAt && p.p_event_created < prev.lastEventAt) {
        done(p.p_event_id, p.p_event_type ?? "unknown");
        return { applied: false, reason: "stale_event", subscription_id: p.p_stripe_subscription_id };
      }
      state.subscriptions.set(p.p_stripe_subscription_id, {
        ...prev, ...p,
        p_school_id: prev?.p_school_id ?? p.p_school_id ?? null,
        p_family_id: prev?.p_family_id ?? p.p_family_id ?? null,
        lastEventAt: p.p_event_created ?? prev?.lastEventAt ?? null,
      });
      done(p.p_event_id, p.p_event_type ?? "unknown");
      const licence = p.p_status === "incomplete" ? null : ACTIVE.includes(p.p_status) ? "active" : "expired";
      return { applied: true, subscription_id: p.p_stripe_subscription_id, licence_id: licence ? `mem-${p.p_stripe_subscription_id}` : null, licence_status: licence };
    },
  };
}

/** One instance per server process (survives Next.js dev module reloads). */
export function sharedMemoryBillingDb() {
  const g = globalThis as unknown as { __wendapplyBillingMemory?: ReturnType<typeof createMemoryBillingDb> };
  g.__wendapplyBillingMemory ??= createMemoryBillingDb();
  return g.__wendapplyBillingMemory;
}
