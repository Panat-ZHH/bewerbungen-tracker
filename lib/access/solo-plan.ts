// Fallback for the "Einzelabo" (solo) plan until lib/billing/plans.ts on this branch carries it (the backend adds PLANS.solo
// with the same values, SPEC §2). Only read through soloPlan() in components/billing/solo.ts.
import type { Plan, PlanId } from "@/lib/billing/plans";

export const SOLO_PLAN_FALLBACK: Plan = {
  id: "solo" as PlanId,
  kind: "individual" as Plan["kind"],
  name: "Einzelabo",
  priceChfPerYear: 49,
  priceChfPerMonth: 4.9,
  studentLimit: 1,
  lookupKey: "wendapply_solo_yearly_chf",
  lookupKeyMonthly: "wendapply_solo_monthly_chf",
  checkout: true,
  invoiceAllowed: false,
};
