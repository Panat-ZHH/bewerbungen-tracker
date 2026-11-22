"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { ArrowLeft, EyeOff, Home, LogIn } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ReadOnlyVillageView } from "@/components/applications/read-only-village-view";
import { FAMILY_VILLAGE_COPY as COPY, familyVillageErrorKind, familyVillageReason, getFamilyVillage, type FamilyVillage, type FamilyVillageErrorKind, type FamilyVillageReason } from "@/lib/family-village";
import { CHILD_FALLBACK, FAMILY_PATH, loginNextFor, memberName } from "@/lib/family-core";
import { childRef } from "@/lib/family-copy";
import { supabase } from "@/lib/supabase";
import own from "./dorf.module.css";

/**
 * /familie/kind/[id]/dorf: a parent looks at the child's real village. Read-only, data from family_child_village only.
 * The screen is the shared ReadOnlyVillageView, the same live village a friend sees on /friends/[id].
 */
export default function ChildVillagePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <WorkspaceShell active="Familie" fullscreen>
      <ChildVillage childId={decodeURIComponent(id ?? "")} />
    </WorkspaceShell>
  );
}

function ChildVillage({ childId }: { childId: string }) {
  const pathname = usePathname();
  const [village, setVillage] = useState<FamilyVillage | null>(null);
  const [failure, setFailure] = useState<FamilyVillageErrorKind | null>(null);
  const [reason, setReason] = useState<FamilyVillageReason>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before the (re)fetch
    setLoading(true); setFailure(null);
    getFamilyVillage(childId)
      .then((value) => { if (active) setVillage(value); })
      .catch(async (cause) => {
        const kind = familyVillageErrorKind(cause);
        // Same as the admin board: an old login ends this browser's session, then a fresh login brings the parent back here.
        if (kind === "reauth") { try { await supabase.auth.signOut({ scope: "local" }); } catch { /* the login link is shown anyway */ } }
        if (active) { setVillage(null); setFailure(kind); setReason(familyVillageReason(cause)); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [childId, attempt]);

  const name = village?.displayName ? memberName(village.displayName, "child") : CHILD_FALLBACK;
  const vonName = childRef(name, "von ");

  if (failure) {
    const hidden = failure === "not_shared" || failure === "not_allowed";
    const text = failure === "reauth" ? COPY.reauth
      : failure === "not_allowed" ? COPY.notAllowed
      : failure === "not_shared" ? (reason === "consent_pending" ? COPY.consentPending : reason === "consent_withdrawn" ? COPY.consentWithdrawn : reason === "village_off" ? COPY.villageOff : COPY.notShared(name))
      : COPY.error;
    const login = `/login?next=${encodeURIComponent(loginNextFor(pathname) ?? FAMILY_PATH)}`;
    return (
      <div className={own.messageWrap} data-village-state={failure}>
        <section className={own.message} role={failure === "error" ? "alert" : "status"}>
          <span className={own.messageIcon} aria-hidden>{failure === "reauth" ? <LogIn size={22} /> : <EyeOff size={22} />}</span>
          <h1 className="text-title">{failure === "reauth" ? "Bitte melde dich erneut an" : failure === "not_shared" ? "Dorf nicht geteilt" : failure === "not_allowed" ? "Dorf nicht verfügbar" : "Das hat nicht geklappt"}</h1>
          <p className="text-body text-muted">{text}</p>
          <div className={own.actions}>
            {failure === "reauth" && <ButtonLink href={login} icon={<LogIn size={16} aria-hidden />}>{COPY.login}</ButtonLink>}
            {failure === "error" && <Button type="button" onClick={() => setAttempt(attempt + 1)}>{COPY.retry}</Button>}
            <ButtonLink href={FAMILY_PATH} variant={hidden ? "primary" : "secondary"} icon={<ArrowLeft size={16} aria-hidden />}>{COPY.back}</ButtonLink>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={own.village} data-village-state={loading ? "loading" : "ready"}>
      <ReadOnlyVillageView
        village={village}
        loading={loading}
        heading={village ? `${COPY.title(vonName)} (nur ansehen)` : "Dorf deines Kindes"}
        label={COPY.title(vonName)}
        waitingText="Dorf wird geladen ..."
        back={{ href: FAMILY_PATH, ariaLabel: COPY.back, text: "Familie" }}
        chip={{
          id: "child-village",
          icon: <Home size={16} aria-hidden />,
          name,
          panelLabel: `Info zum ${COPY.title(vonName)}`,
          note: <>{village?.showCompanies ? COPY.infoCompanies(childRef(name, "sich ")) : COPY.infoNoCompanies} {COPY.infoPrivate}</>,
        }}
      />
    </div>
  );
}
