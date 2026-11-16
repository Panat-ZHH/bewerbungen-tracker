/**
 * Parent next-best-action for /familie (BILLING-FLOW-SPEC.md §3.1). Pure: no React, no fetch, so node --test can import it.
 * Order: family -> child (invite / wait / consent) -> plan (buy / fix payment / rebuy) -> done. Flag off: no plan step.
 */
import type { MyFamily, FamilyMember } from "../../lib/family-core.ts";
import type { BillingPhase } from "../billing/logic.ts";

export type ParentAction = "create" | "accept_invite" | "invite_child" | "wait_child" | "consent" | "buy" | "fix_payment" | "rebuy" | "done";
export type StepId = "family" | "child" | "plan";
export type StepState = "done" | "current" | "todo" | "attention";
export type ParentSteps = { current: ParentAction; steps: { id: StepId; state: StepState }[] };

/** Phases in which the family package is booked (step 3 done). */
export const PAID_PHASES: readonly BillingPhase[] = ["active", "trialing", "canceling", "paused"];
/** Phases that need the parent to fix the payment method (banner + primary "Karte aktualisieren"). */
export const FIX_PHASES: readonly BillingPhase[] = ["past_due", "unpaid"];

const kidsOf = (f: MyFamily): FamilyMember[] => f.members.filter((m) => m.role === "child" && m.status === "active");
/** A child counts as connected once it is active and its consent is granted or not required (16+). */
export const connectedChild = (f: MyFamily): FamilyMember | null =>
  kidsOf(f).find((k) => k.consentStatus === "granted" || k.consentStatus === "not_required") ?? null;
/** The child whose consent the parent still has to give (pending, or withdrawn earlier), or null. */
export const childNeedingConsent = (f: MyFamily): FamilyMember | null =>
  kidsOf(f).find((k) => k.consentStatus === "pending" || k.consentStatus === "withdrawn") ?? null;
/** My open, unexpired code for my child (family_get_my returns only my own unused codes). */
export function openChildInvite(f: MyFamily, now: Date = new Date()): { code: string; expiresAt: string | null } | null {
  const i = (f.invites ?? []).find((x) => x.direction === "parent_invites_child" && (!x.expiresAt || Date.parse(x.expiresAt) > now.getTime()));
  return i ? { code: i.code, expiresAt: i.expiresAt } : null;
}

export function parentNextAction(family: MyFamily | null, phase: BillingPhase, ctx: { initialCode: string; online: boolean; now?: Date }): ParentSteps {
  const withPlan = (family: StepState, child: StepState, plan: StepState) =>
    (ctx.online ? [{ id: "family", state: family }, { id: "child", state: child }, { id: "plan", state: plan }] : [{ id: "family", state: family }, { id: "child", state: child }]) as ParentSteps["steps"];
  const planState: StepState = PAID_PHASES.includes(phase) ? "done" : FIX_PHASES.includes(phase) ? "attention" : "todo";

  if (!family) return { current: ctx.initialCode ? "accept_invite" : "create", steps: withPlan("current", "todo", "todo") };
  if (!connectedChild(family)) {
    if (childNeedingConsent(family)) return { current: "consent", steps: withPlan("done", "attention", planState) };
    return { current: openChildInvite(family, ctx.now) ? "wait_child" : "invite_child", steps: withPlan("done", "current", planState) };
  }
  if (!ctx.online) return { current: "done", steps: withPlan("done", "done", "done") };
  if (FIX_PHASES.includes(phase)) return { current: "fix_payment", steps: withPlan("done", "done", "attention") };
  if (PAID_PHASES.includes(phase)) return { current: "done", steps: withPlan("done", "done", "done") };
  return { current: phase === "ended" ? "rebuy" : "buy", steps: withPlan("done", "done", "current") };
}

// TODO(copy): move to FAMILY_COPY (one muted line for steps that are still to do).
export const STEP_TODO_TEXT: Record<StepId, string> = {
  family: "Dauert eine Minute.",
  child: "Mit einem Code, den du deinem Kind schickst.",
  plan: "Für dich und dein Kind, monatlich oder jährlich.",
};
