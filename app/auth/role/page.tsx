"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BirthYearField, RoleCards } from "@/components/onboarding/role-cards";
import { AuthFrame, AuthTitle } from "@/components/onboarding/auth-frame";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { chooseRole, landingPath, needsRoleChoice, parentLandingPath, studentOnboardingHref, TEACHER_HOME } from "@/lib/role";
import { choiceToAccount, isValidBirthYear, signupMetadata, type SignupChoice } from "@/lib/family-core";
import { syncPendingAccountType } from "@/lib/family";
import { authMessage, safeNextPath } from "@/lib/ux";

/** Asked once for accounts without an explicit role (e.g. first Google login). */
export default function ChooseRolePage() {
  const router = useRouter();
  const [role, setRole] = useState<SignupChoice | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
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
    if (role === "independent" && !isValidBirthYear(birthYear)) { setError("Bitte wähle deinen Jahrgang."); return; }
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { role: baseRole, accountType } = choiceToAccount(role);
      const effective = await chooseRole(data.user, baseRole);
      if (effective === "student" && accountType) {
        // Private customers: remember the account type and store it with account_set_type (retried later if not deployed yet).
        const { data: updated } = await supabase.auth.updateUser({ data: signupMetadata(role, birthYear) });
        await syncPendingAccountType(updated.user ?? data.user);
      }
      router.replace(effective === "teacher" ? TEACHER_HOME : accountType === "parent" && effective === "student" ? parentLandingPath(next()) : studentOnboardingHref(next()));
    } catch (reason) { setError(authMessage(reason)); setBusy(false); }
  }

  return (
    <AuthFrame className="max-w-[600px]">
        {!ready ? <p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p> : (
          <div className="space-y-6">
            <AuthTitle title={<>Wie nutzt du <span className="marker">WendApply</span>?</>}>Das fragen wir nur einmal. So zeigen wir dir die passende Ansicht.</AuthTitle>
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            <RoleCards value={role} onChange={setRole} disabled={busy} />
            {role === "independent" && <BirthYearField value={birthYear} onChange={setBirthYear} />}
            <Button size="lg" disabled={!role} loading={busy} onClick={confirm} className="w-full sm:w-auto sm:min-w-48">Weiter</Button>
          </div>
        )}
    </AuthFrame>
  );
}
