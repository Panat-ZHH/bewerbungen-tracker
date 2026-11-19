"use client";

// The old 3-step student wizard is gone (SPEC-FLOW D7/§6.7): the funnel asked everything, the spotlight tour runs on /dashboard.
// /onboarding → /dashboard; /onboarding?replay=1 (old settings link) or ?tour=1 → /dashboard?tour=1. Route owner: onb-funnel.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { studentWizardRedirect } from "@/lib/role";

export default function OnboardingRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(studentWizardRedirect(window.location.search)); }, [router]);
  return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p></main>;
}
