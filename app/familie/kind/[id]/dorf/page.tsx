"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Anchor, ArrowLeft, Eye, EyeOff, Home, LogIn } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MapBadge, MapChip, MapControls, MapDock, MapFullscreen, MapTopBar, overlayClasses } from "@/components/applications/map-fullscreen";
import { useCameraControls } from "@/components/applications/use-camera-controls";
import { FAMILY_VILLAGE_COPY as COPY, familyVillageErrorKind, familyVillageReason, getFamilyVillage, type FamilyVillage, type FamilyVillageErrorKind, type FamilyVillageReason } from "@/lib/family-village";
import { CHILD_FALLBACK, FAMILY_PATH, loginNextFor, memberName } from "@/lib/family-core";
import { childRef } from "@/lib/family-copy";
import { ISLANDS } from "@/lib/islands-config";
import { lockedDrag, noopHandler } from "@/lib/map-readonly";
import { supabase } from "@/lib/supabase";
import styles from "@/app/map/map.module.css";
import layout from "@/app/map/fullscreen.module.css";
import own from "./dorf.module.css";

const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));

/** /familie/kind/[id]/dorf: a parent looks at the child's real village. Read-only, data from family_child_village only. */
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
  const camera = useCameraControls();
  const [night, setNight] = useState(false);
  const [focus, setFocus] = useState<{ no: number; reveal: boolean; key: number } | null>(null);

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

  const visibleIds = useMemo(() => village?.applications.map(({ id }) => id) ?? [], [village]);
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

  const switcher = village && village.islandCount > 1;
  return (
    <div className={own.village} data-village-state={loading ? "loading" : "ready"}>
      <h1 className="sr-only">{village ? `${COPY.title(vonName)} (nur ansehen)` : "Dorf deines Kindes"}</h1>
      <MapFullscreen
        label={COPY.title(vonName)}
        busy={loading}
        map={village ? (
          <Suspense fallback={<div className={styles.loading} role="status">Dorf wird aufgebaut ...</div>}>
            <ApplicationMapWorld readOnly applications={village.applications} visibleIds={visibleIds} selectedId={null} night={night} zoom={camera.zoom} center={camera.center} onZoomChange={camera.setZoom} onCameraApi={camera.onCameraApi} onSelect={noopHandler} shopItems={village.items} layouts={village.layouts} selectedShopItemId={null} placement={null} onSelectShopItem={noopHandler} onPlacePosition={noopHandler} drag={lockedDrag} islandCount={village.islandCount} islandFocus={focus} />
          </Suspense>
        ) : <div className={styles.loading} role="status" aria-label="Dorf wird geladen">Dorf wird geladen ...</div>}
      >
        <MapTopBar
          left={<>
            <Link href={FAMILY_PATH} className={`${layout.chip} ${layout.friendBack} ${overlayClasses.sticker}`} aria-label={COPY.back}><ArrowLeft size={16} aria-hidden /><span className={layout.chipLabel}>Familie</span></Link>
            <MapChip id="child-village" icon={<Home size={16} aria-hidden />} label={name} meta={<Eye size={14} aria-label={COPY.readOnly} />} panelLabel={`Info zum ${COPY.title(vonName)}`}>
              <h2 className={layout.panelHeading}>{COPY.readOnly}</h2>
              <p className={layout.friendNote}>{village?.showCompanies ? COPY.infoCompanies(childRef(name, "sich ")) : COPY.infoNoCompanies} {COPY.infoPrivate}</p>
            </MapChip>
          </>}
          right={<>
            {switcher && (
              <MapChip id="child-village-islands" icon={<Anchor size={16} />} label="Inseln" panelLabel="Inseln">
                <div className={layout.switcherGroup} role="group" aria-label="Inseln">
                  {Array.from({ length: village.islandCount }, (_, index) => index + 1).map((no) => <button key={no} type="button" className={layout.switcherButton} onClick={() => setFocus((previous) => ({ no, reveal: false, key: (previous?.key ?? 0) + 1 }))}><Anchor size={14} aria-hidden />{ISLANDS.find((entry) => entry.no === no)?.name ?? `Insel ${no}`}</button>)}
                </div>
              </MapChip>
            )}
            <MapBadge label={COPY.readOnly}><Eye size={15} aria-hidden /><span className={overlayClasses.hideNarrow}>{COPY.readOnly}</span></MapBadge>
          </>}
        />
        <MapControls camera={camera} night={night} onToggleNight={() => setNight(!night)} />
        <MapDock>{null}</MapDock>
      </MapFullscreen>
    </div>
  );
}
