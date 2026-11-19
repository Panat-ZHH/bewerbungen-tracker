// Where to go after the funnel answers are saved (SPEC-DATA §3.7). Pure: node --test loads it directly.
// funnelNextPath = an allow-list ON TOP of safeNextPath (lib/ux.ts): only these same-origin app paths survive the funnel.
import { safeNextPath } from "../ux.ts";
import type { FunnelStateV1 } from "./types.ts";

const ALLOWED: RegExp[] = [
  /^\/dashboard$/, /^\/familie$/, /^\/familie\/einladung\/[A-Z0-9]{8}(\?fuer=(kind|eltern))?$/, /^\/classes\/join\/[A-Za-z0-9_-]{4,128}(\?next=%2Fdashboard)?$/,
  /^\/invite\/[A-Za-z0-9_-]{4,64}$/, /^\/teacher$/, /^\/schullizenz$/, /^\/schul-admin$/, /^\/onboarding\/klasse$/, /^\/settings$/, /^\/abo$/,
];

/** The `next` path if it is on the funnel allow-list (exact shapes, max 256 chars), else null. */
export function funnelNextPath(next: string | null | undefined): string | null {
  const safe = safeNextPath(next);
  if (!safe || safe.length > 256) return null;
  return ALLOWED.some((re) => re.test(safe)) ? safe : null;
}

/** «Tour wiederholen» link target: `<path>?tour=1`. */
export const withTourParam = (path: string) => `${path}${path.includes("?") ? "&" : "?"}tour=1`;

/**
 * Redirect after a successful save, or null = let resolveLanding decide (it also respects funnelNextPath(next)).
 * Order: class code from the funnel → /classes/join/<code>?next=/dashboard; pupil family «jetzt» → /familie (invite step);
 * parent «code» → /familie/einladung/<code>; else the allow-listed `next`.
 */
export function funnelRedirect(state: Pick<FunnelStateV1, "role" | "classCode" | "family" | "parentKid" | "inviteCode" | "next"> | null): string | null {
  if (!state) return null;
  if (state.role === "student" && /^[A-Z0-9]{4,16}$/.test(state.classCode)) return `/classes/join/${state.classCode}?next=%2Fdashboard`;
  if (state.role === "student" && state.family === "jetzt") return "/familie";
  if (state.role === "parent" && state.parentKid === "code" && /^[A-Z0-9]{8}$/.test(state.inviteCode)) return `/familie/einladung/${state.inviteCode}`;
  return funnelNextPath(state.next);
}
