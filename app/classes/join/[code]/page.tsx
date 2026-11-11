"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useJoinConsent } from "@/components/classes/join-consent";
import { errorMessage } from "@/components/classes/shared";
import { clearPendingInvite, storePendingInvite } from "@/components/friends/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { acceptInvite, isInviteToken, joinClass, previewClass, previewInvite, type ClassPreview } from "@/lib/classes";
import { getMySocialProfile } from "@/lib/social";
import { supabase } from "@/lib/supabase";

type Loaded = (ClassPreview & { valid: boolean; reason: string | null }) | null;

/** Invitation links carry either a token (>= 22 url-safe chars, case sensitive) or the short class code. */
function JoinContent({ code }: { code: string }) {
  const token = isInviteToken(code);
  const [preview, setPreview] = useState<Loaded | undefined>(undefined);
  const [isTeacher, setIsTeacher] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const consent = useJoinConsent();
  const loadConsent = consent.load;

  useEffect(() => {
    let alive = true;
    const lookup = token ? previewInvite(code) : previewClass(code.toUpperCase()).then((p) => ({ ...p, valid: true, reason: null }));
    Promise.all([lookup.catch((e) => { if (alive) setError(errorMessage(e)); return null; }), getMySocialProfile().catch(() => null)])
      .then(async ([found, me]) => { if (!alive) return; if (me?.role !== "teacher") await loadConsent(); if (!alive) return; setPreview(found); setIsTeacher(me?.role === "teacher"); });
    return () => { alive = false; };
  }, [code, token, loadConsent]);

  async function join() {
    setBusy(true); setError("");
    try { await consent.run(() => (token ? acceptInvite(code) : joinClass(code.toUpperCase()))); clearPendingInvite(); setJoined(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  if (preview === undefined) return <Card className="mx-auto max-w-md p-6" aria-busy="true"><Skeleton className="mx-auto h-16 w-16 rounded-full" /><Skeleton className="mx-auto mt-4 h-6 w-1/2" /><Skeleton className="mt-6 h-11" /></Card>;
  const invalidReason = preview && !preview.valid ? errorMessage(new Error(preview.reason ?? "INVALID")) : "";
  if (!preview || (!preview.valid && !preview.alreadyMember)) return <EmptyState className="mx-auto max-w-md" title={token ? "Einladung nicht gültig" : "Klassencode nicht gefunden"} description={invalidReason || error || "Dieser Link ist nicht mehr gültig. Frag deine Lehrperson nach einem neuen Link."} action={<ButtonLink href="/classes" variant="secondary">Zu meinen Klassen</ButtonLink>} />;

  return (
    <Card className="animate-rise mx-auto max-w-md space-y-5 p-6 text-center sm:p-8">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><GraduationCap size={30} /></span>
      <div>
        <p className="text-eyebrow">Klasseneinladung</p>
        <h1 className="text-title mt-1 break-words">{preview.name}</h1>
        <p className="mt-1 text-body text-muted">{preview.teacherName}{preview.schoolYear ? ` · Schuljahr ${preview.schoolYear}` : ""}</p>
      </div>
      {joined || preview.alreadyMember ? (
        <div className="space-y-3">
          <StatusMessage tone="success">{joined ? "Du bist beigetreten." : "Du bist schon in dieser Klasse."} Unter «Meine Klassen» kannst du jede Freigabe jederzeit ändern.</StatusMessage>
          <ButtonLink href="/classes" full>Zu meinen Klassen</ButtonLink>
        </div>
      ) : isTeacher ? (
        <StatusMessage tone="info">Du bist als Lehrperson angemeldet. Nur Schülerkonten können einer Klasse beitreten.</StatusMessage>
      ) : (
        <div className="space-y-3 text-left">
          {consent.fields(preview.teacherName)}
          <Button full size="lg" loading={busy} disabled={!consent.ready} onClick={join} icon={<ShieldCheck size={17} />}>Beitreten</Button>
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}
          <ButtonLink href="/classes" full variant="ghost" className="min-h-11 sm:min-h-11">Nicht jetzt</ButtonLink>
        </div>
      )}
    </Card>
  );
}

export default function ClassJoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(String(params.code ?? "")).trim();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (data.user) setSignedIn(true);
      else { storePendingInvite(code, "class"); router.replace(`/login?next=${encodeURIComponent(`/classes/join/${encodeURIComponent(code)}`)}`); }
    });
    return () => { alive = false; };
  }, [code, router]);

  if (!signedIn) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p className="text-sm text-muted">Einladung wird geöffnet …</p></main>;
  return <WorkspaceShell active="Klassen"><JoinContent code={code} /></WorkspaceShell>;
}
