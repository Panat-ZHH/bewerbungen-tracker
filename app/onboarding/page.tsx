import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/ux";

/**
 * The old 3-step student wizard is retired (SPEC-FLOW D7/§6.7): the funnel /start asks everything before sign-up and the
 * spotlight tour starts on the dashboard. Server redirect, same rule as `studentWizardRedirect` (lib/role.ts) plus a safe `next`:
 * `?replay=1` (old «Tour wiederholen») or `?tour=1` → `/dashboard?tour=1`, a safe `?next=` → that page, else `/dashboard`.
 * (Server-side on purpose: lib/role.ts pulls in the browser Supabase client.)
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  if (one(q.replay) === "1" || one(q.tour) === "1") redirect("/dashboard?tour=1");
  const next = safeNextPath(one(q.next));
  redirect(next && next !== "/" && !next.startsWith("/onboarding") && !next.startsWith("/start") ? next : "/dashboard");
}
