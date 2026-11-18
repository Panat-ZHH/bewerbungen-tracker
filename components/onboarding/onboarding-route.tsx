"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loadMyAccess } from "@/lib/access/client";
import { isParentAccount, isSchoolAdmin } from "@/lib/access/gate";
import { FAMILY_PATH } from "@/lib/family-core";
import { landingPath, loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";

/**
 * /onboarding is the pupil tour. Parents (→ /familie), school admins (→ /schul-admin) and teachers (→ their home) are sent to
 * their own start page before anything renders (eltern-11, schule-31). Routing only: the access gate itself stays in AccessGuard.
 */
export function OnboardingRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        // getUser needs the network: offline with a stored session, show the tour instead of bouncing to /login (QA m2).
        const { data: stored } = await supabase.auth.getSession();
        if (!alive) return;
        if (stored.session) setOk(true); else router.replace("/login");
        return;
      }
      const [access, { role }] = await Promise.all([
        loadMyAccess({ userId: data.user.id }).catch(() => null),
        loadMyRole(data.user).catch(() => ({ role: "student" as const })),
      ]);
      if (!alive) return;
      if (role === "teacher") { router.replace(landingPath("teacher")); return; }
      if (isSchoolAdmin(access)) { router.replace("/schul-admin"); return; }
      if (isParentAccount(data.user.user_metadata, access)) { router.replace(FAMILY_PATH); return; }
      setOk(true);
    })().catch(() => { if (alive) setOk(true); }); // never an endless spinner: the access gate (AccessGuard, server) still applies
    return () => { alive = false; };
  }, [router]);

  if (!ok) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p></main>;
  return <>{children}</>;
}
