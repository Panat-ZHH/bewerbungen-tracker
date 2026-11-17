"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/section";
import { tourHref } from "@/lib/onboarding-tour-core";
import { loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/ux";

/** Students only: opens the first-login tour again (replay mode: nothing is reset, closing it returns here). */
export function TourReplaySection() {
  const [student, setStudent] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { role } = await loadMyRole(data.user);
      if (alive) setStudent(role === "student");
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!student) return null;
  return (
    <SettingsSection title="Einführung" titleTestId="section-tour" description="Die kurze Tour nach deiner ersten Anmeldung. Deine Daten bleiben, wie sie sind.">
      <ButtonLink href={tourHref(safeNextPath, null, true)} variant="secondary" className="sm:min-h-11" icon={<Compass size={16} />}>Einführung nochmals ansehen</ButtonLink>
    </SettingsSection>
  );
}
