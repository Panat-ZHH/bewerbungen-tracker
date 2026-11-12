"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleCards } from "@/components/onboarding/role-cards";
import { AuthFrame, AuthTitle } from "@/components/onboarding/auth-frame";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { chooseRole, landingPath, needsRoleChoice, studentOnboardingHref, TEACHER_HOME } from "@/lib/role";
import { authMessage, safeNextPath } from "@/lib/ux";
import type { UserRole } from "@/types";

/** Asked once for accounts without an explicit role (e.g. first Google login). */
export default function ChooseRolePage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = () => safeNextPath(new URLSearchParams(window.location.search).get("next"));

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (!data.user) { router.replace("/login"); return; }
      // Already decided (or an old account with a role): nothing to ask.
      if (!needsRoleChoice(data.user)) { router.replace(landingPath(data.user.user_metadata?.role === "teacher" ? "teacher" : "student", next())); return; }
      setReady(true);
    });
    return () => { alive = false; };
  }, [router]);

  async function confirm() {
    if (!role) return;
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const effective = await chooseRole(data.user, role);
      router.replace(effective === "teacher" ? TEACHER_HOME : studentOnboardingHref(next()));
    } catch (reason) { setError(authMessage(reason)); setBusy(false); }
  }

  return (
    <AuthFrame className="max-w-[600px]">
        {!ready ? <p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p> : (
          <div className="space-y-6">
            <AuthTitle title={<>Wie nutzt du <span className="marker">WendApply</span>?</>}>Das fragen wir nur einmal. So zeigen wir dir die passende Ansicht.</AuthTitle>
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            <RoleCards value={role} onChange={setRole} disabled={busy} />
            <Button size="lg" disabled={!role} loading={busy} onClick={confirm} className="w-full sm:w-auto sm:min-w-48">Weiter</Button>
          </div>
        )}
    </AuthFrame>
  );
}
