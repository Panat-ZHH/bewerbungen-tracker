import { supabase } from "@/lib/supabase";
import { createApplication } from "@/lib/storage";
import { isSentStatus } from "@/lib/status";
import { interpretTourRow, isMissingSchemaError, UNKNOWN_TOUR, type FirstApplicationInput, type TourStatus } from "@/lib/onboarding-tour-core";

export * from "@/lib/onboarding-tour-core";

/** Tour state of the signed-in user (RLS: own row only). Never throws: an old DB without the columns gives UNKNOWN_TOUR. */
export async function loadTourStatus(userId?: string): Promise<TourStatus> {
  try {
    let id = userId;
    if (!id) { const { data } = await supabase.auth.getUser(); id = data.user?.id; }
    if (!id) return UNKNOWN_TOUR;
    const { data, error } = await supabase.from("profiles").select("onboarding_tour_completed_at,onboarding_tour_step").eq("user_id", id).maybeSingle();
    return interpretTourRow(data as { onboarding_tour_completed_at: string | null; onboarding_tour_step: number | null } | null, error);
  } catch { return UNKNOWN_TOUR; }
}

/** Remembers the step reached (best effort: an old DB without the RPC is ignored, the tour still works). */
export async function saveTourStep(step: number): Promise<void> {
  try {
    const { error } = await supabase.rpc("onboarding_tour_set", { p_step: step, p_complete: false });
    if (error && !isMissingSchemaError(error)) console.warn("onboarding_tour_set", error.message);
  } catch { /* offline: the step is only a convenience */ }
}

/**
 * Marks the tour as done (finished or skipped). The auth metadata flag is the source of truth for the gate, so even
 * without the new DB column the user is never sent through the tour again. `student_onboarded` keeps older code paths happy.
 */
export async function completeTour(step: number): Promise<void> {
  const [rpc, meta] = await Promise.allSettled([
    supabase.rpc("onboarding_tour_set", { p_step: step, p_complete: true }),
    supabase.auth.updateUser({ data: { onboarding_tour_done: true, student_onboarded: true } }),
  ]);
  const metaFailed = meta.status === "rejected" || !!meta.value.error;
  const rpcFailed = rpc.status === "rejected" || (!!rpc.value.error && !isMissingSchemaError(rpc.value.error));
  if (metaFailed && rpcFailed) throw (meta.status === "rejected" ? meta.reason : meta.value.error) ?? new Error("Die Einführung konnte nicht gespeichert werden.");
}

/** Step 3: saves the first application exactly like the normal form does (lib/storage createApplication). */
export async function saveFirstApplication(input: FirstApplicationInput) {
  return createApplication({
    company: input.company, position: input.position, status: input.status, category: "other",
    appliedAt: isSentStatus(input.status) ? new Date().toISOString().slice(0, 10) : undefined,
  });
}
