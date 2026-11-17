"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, School } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { formatDateCh } from "@/lib/family-core";
import { ABO_PATH, isEnforced, isStaff } from "@/lib/access/gate";
import { useAccess } from "./access-provider";
import { LicenceGate } from "./access-pages";

/** Teachers without a licence see the gate; with a licence (or rules not active yet) a short "all good" + link to the classes. */
export function SchoolLicenceView() {
  const { access } = useAccess();
  const [metaTeacher, setMetaTeacher] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { setMetaTeacher(data.user?.user_metadata?.role === "teacher"); setEmail(data.user?.email ?? null); }); }, []);
  const staff = isStaff(access) || metaTeacher;

  if (staff && isEnforced(access) && !access.has_access) return <LicenceGate access={access} email={email} />;
  if (staff) {
    return (
      <section data-testid="licence-active" className="mx-auto max-w-[640px] py-4 sm:py-8">
        <div className="panel space-y-4 p-5 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] [&>svg]:h-6 [&>svg]:w-6" aria-hidden><CheckCircle2 /></span>
          <h1 className="text-display text-[clamp(1.9rem,4.5vw,2.6rem)] leading-[1.05]">Dein Zugang ist <span className="marker">aktiv</span></h1>
          <p className="text-body">
            {access?.school ? <>Du nutzt WendApply über die Lizenz von <strong>{access.school.name}</strong>{access.school.valid_until ? <> (gültig bis {formatDateCh(access.school.valid_until)})</> : null}.</> : "Du kannst WendApply mit deinen Klassen nutzen."}
          </p>
          <ButtonLink href="/teacher" size="lg">Zu deinen Klassen</ButtonLink>
        </div>
      </section>
    );
  }
  // Parents reach this page only by link: the school path is not for them (eltern-12). UI only, no access decision.
  if (access?.account_type === "parent") {
    return (
      <section data-testid="licence-parent" className="mx-auto max-w-[640px] py-4 sm:py-8">
        <div className="panel space-y-4 p-5 sm:p-8">
          <h1 className="text-display text-[clamp(1.9rem,4.5vw,2.6rem)] leading-[1.05]">Zugang über die <span className="marker">Schule</span></h1>
          <p className="text-body">Die Schullizenz gilt für Schüler:innen einer Klasse. Für Eltern gibt es das Familienpaket.</p>
          <ButtonLink href="/familie" size="lg">Zur Familie</ButtonLink>
        </div>
      </section>
    );
  }
  return (
    <section data-testid="licence-student" className="mx-auto max-w-[640px] py-4 sm:py-8">
      <div className="panel space-y-4 p-5 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] [&>svg]:h-6 [&>svg]:w-6" aria-hidden><School /></span>
        <h1 className="text-display text-[clamp(1.9rem,4.5vw,2.6rem)] leading-[1.05]">Zugang über die <span className="marker">Schule</span></h1>
        <p className="text-body">
          {access?.reason === "school_licence"
            ? <>Dein Zugang läuft über {access.school ? <strong>{access.school.name}</strong> : "deine Schule"}. Du musst nichts bezahlen.</>
            : "Hat deine Schule eine Lizenz, tritt der Klasse mit dem Code deiner Lehrperson bei. Dann nutzt du WendApply über die Schule."}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/classes" size="lg" variant="secondary">Klasse beitreten</ButtonLink>
          {access?.reason !== "school_licence" && <ButtonLink href={ABO_PATH} size="lg" variant="ghost">Lieber ein eigenes Abo</ButtonLink>}
        </div>
      </div>
    </section>
  );
}
