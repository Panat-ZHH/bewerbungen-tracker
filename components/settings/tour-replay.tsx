"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/section";
import { useAccess } from "@/components/access/access-provider";
import { isParentAccount, isSchoolAdmin } from "@/lib/access/gate";
import { loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { replayHref, tourFor, type TourId } from "@/components/tour/tour-core";

/** «Tour wiederholen» for every role (SPEC-FLOW §6.6): opens the role's start page with ?tour=1. Nothing is reset. */
export function TourReplaySection() {
  const { access, loading } = useAccess();
  const [tour, setTour] = useState<TourId | null>(null);
  useEffect(() => {
    if (loading) return;
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { role } = await loadMyRole(data.user);
      if (alive) setTour(tourFor({ role, parent: role !== "teacher" && isParentAccount(data.user.user_metadata, access), schoolAdmin: isSchoolAdmin(access) }));
    }).catch(() => { if (alive) setTour("schueler"); });
    return () => { alive = false; };
  }, [access, loading]);
  return (
    <SettingsSection title="Tour" titleTestId="section-tour" description="Lass dir die wichtigsten Stellen in der App noch einmal zeigen.">
      <ButtonLink href={replayHref(tour ?? "schueler")} variant="secondary" className="sm:min-h-11" icon={<Compass size={16} />} aria-disabled={tour ? undefined : true} data-testid="tour-replay">Tour wiederholen</ButtonLink>
    </SettingsSection>
  );
}
