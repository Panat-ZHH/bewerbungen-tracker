"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { PrivacyPanel } from "@/components/classes/privacy-panel";
import { errorMessage } from "@/components/classes/shared";
import { clearPendingInvite, storePendingInvite } from "@/components/friends/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { type ClassPreview, joinClass, previewClass } from "@/lib/classes";
import { getMySocialProfile } from "@/lib/social";
import { supabase } from "@/lib/supabase";

function JoinContent({ code }: { code: string }) {
  const [preview, setPreview] = useState<ClassPreview | null | undefined>(undefined);
  const [isTeacher, setIsTeacher] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([previewClass(code).catch((e) => { if (alive) setError(errorMessage(e)); return null; }), getMySocialProfile().catch(() => null)])
      .then(([found, me]) => { if (!alive) return; setPreview(found); setIsTeacher(me?.role === "teacher"); });
    return () => { alive = false; };
  }, [code]);

  async function join() {
    setBusy(true); setError("");
    try { await joinClass(code); clearPendingInvite(); setJoined(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  if (preview === undefined) return <Card className="mx-auto max-w-md p-6" aria-busy="true"><Skeleton className="mx-auto h-16 w-16 rounded-full" /><Skeleton className="mx-auto mt-4 h-6 w-1/2" /><Skeleton className="mt-6 h-11" /></Card>;
  if (!preview) return <EmptyState className="mx-auto max-w-md" title="Klassencode nicht gefunden" description={error || "Dieser Link ist nicht mehr gültig. Frag deine Lehrkraft nach einem neuen Link."} action={<ButtonLink href="/classes" variant="secondary">Zu meinen Klassen</ButtonLink>} />;

  return (
    <Card className="animate-rise mx-auto max-w-md space-y-5 p-6 text-center sm:p-8">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><GraduationCap size={30} /></span>
      <div>
        <p className="text-eyebrow">Klasseneinladung</p>
        <h1 className="text-title mt-1 break-words">{preview.name}</h1>
        <p className="mt-1 text-body text-muted">{preview.teacherName}{preview.schoolYear ? ` · Schuljahr ${preview.schoolYear}` : ""}</p>
      </div>
      {joined || preview.alreadyMember ? (
        <div className="space-y-3">
          <StatusMessage tone="success">{joined ? "Du bist beigetreten." : "Du bist schon in dieser Klasse."} Du kannst die Freigabe unter „Meine Klassen“ jederzeit pausieren.</StatusMessage>
          <ButtonLink href="/classes" full>Zu meinen Klassen</ButtonLink>
        </div>
      ) : isTeacher ? (
        <StatusMessage tone="info">Du bist als Lehrkraft angemeldet. Nur Schülerkonten können einer Klasse beitreten.</StatusMessage>
      ) : (
        <div className="space-y-3 text-left">
          <PrivacyPanel variant="class" teacherName={preview.teacherName} />
          <Button full size="lg" loading={busy} onClick={join} icon={<ShieldCheck size={17} />}>Beitreten und Freigabe erlauben</Button>
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}
          <ButtonLink href="/classes" full variant="ghost">Nicht jetzt</ButtonLink>
        </div>
      )}
    </Card>
  );
}

export default function ClassJoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(String(params.code ?? "")).trim().toUpperCase();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (data.user) setSignedIn(true);
      else { storePendingInvite(code, "class"); router.replace("/login"); }
    });
    return () => { alive = false; };
  }, [code, router]);

  if (!signedIn) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p className="text-sm text-muted">Einladung wird geöffnet …</p></main>;
  return <WorkspaceShell active="Klassen"><JoinContent code={code} /></WorkspaceShell>;
}
