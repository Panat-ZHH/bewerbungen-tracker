"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleCards } from "@/components/onboarding/role-cards";
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
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="animate-rise w-full max-w-[520px]">
        <Image src="/logo.png" alt="WendApply" width={56} height={56} className="logo-tile mx-auto rounded-[16px] bg-[#f2f7ff] p-1 shadow-[var(--shadow-md)]" priority />
        {!ready ? <p role="status" className="mt-6 text-center text-sm text-muted">Einen Moment …</p> : (
          <div className="glass-surface mt-6 space-y-5 p-5 sm:p-7">
            <div className="text-center">
              <h1 className="text-title">Wie nutzt du WendApply?</h1>
              <p className="mt-2 text-sm text-muted">Das fragen wir nur einmal. So zeigen wir dir die passende Ansicht.</p>
            </div>
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            <RoleCards value={role} onChange={setRole} disabled={busy} />
            <Button full size="lg" disabled={!role} loading={busy} onClick={confirm}>Weiter</Button>
          </div>
        )}
      </div>
    </main>
  );
}
