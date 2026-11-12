"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { clearPendingInvite, friendlyError, storePendingInvite } from "@/components/friends/shared";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { findUserByCode, sendFriendRequest } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import type { SocialLookup } from "@/types";

const relationText: Record<string, string> = {
  self: "Das ist dein eigener Einladungslink. Schick ihn an jemanden, der sich auch bewirbt.",
  friend: "Ihr seid bereits befreundet.",
  pending_out: "Deine Anfrage ist schon unterwegs.",
  pending_in: "Diese Person hat dir bereits eine Anfrage geschickt. Du kannst sie bei den Freunden annehmen.",
};

function InviteContent({ code }: { code: string }) {
  const [inviter, setInviter] = useState<SocialLookup | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    let alive = true;
    findUserByCode(code)
      .then((found) => { if (alive) setInviter(found ?? null); })
      .catch((reason) => { if (alive) { setError(friendlyError(reason, "Die Einladung konnte nicht geprüft werden.")); setInviter(null); } });
    return () => { alive = false; };
  }, [code]);

  async function add() {
    setBusy(true); setError("");
    try {
      const result = await sendFriendRequest(code);
      clearPendingInvite();
      setDone(result.status === "accepted" ? "Ihr seid jetzt befreundet." : "Anfrage gesendet. Sobald sie angenommen wird, seid ihr verbunden.");
    } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(false); }
  }

  if (inviter === undefined) return <Card className="mx-auto max-w-md p-6" aria-busy="true"><Skeleton className="mx-auto h-20 w-20 rounded-full" /><Skeleton className="mx-auto mt-4 h-6 w-1/2" /><Skeleton className="mt-6 h-11" /></Card>;
  if (!inviter) return <EmptyState className="mx-auto max-w-md" title="Einladung nicht gefunden" description={error || "Dieser Code gehört zu niemandem. Bitte frag nach einem neuen Link."} action={<ButtonLink href="/friends" variant="secondary">Zu den Freunden</ButtonLink>} />;

  return (
    <Card className="animate-rise relative mx-auto mt-4 flex max-w-md flex-col items-center p-6 text-center shadow-[var(--shadow-lg)] sm:p-8">
      <span className="sticker tilt-l3 absolute -left-2 -top-3.5">Einladung</span>
      <Avatar name={inviter.displayName} size="xl" />
      <h1 className="text-title mt-5 max-w-full break-words">{inviter.displayName}</h1>
      <p className="mt-2 text-body text-muted">möchte mit dir bei WendApply befreundet sein und gemeinsam dranbleiben.</p>
      <div className="mt-6 w-full space-y-3">
        {done ? (
          <>
            <StatusMessage tone="success">{done}</StatusMessage>
            <ButtonLink href="/friends" full>Zu meinen Freunden</ButtonLink>
          </>
        ) : inviter.relation === "none" ? (
          <>
            <Button full size="lg" loading={busy} onClick={add} icon={<UserPlus size={17} />}>Als Freund hinzufügen</Button>
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            <Link href="/friends" className="text-small flex min-h-11 items-center justify-center font-medium text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)]">Später</Link>
          </>
        ) : (
          <>
            <StatusMessage tone="info">{relationText[inviter.relation]}</StatusMessage>
            <ButtonLink href="/friends" full variant="secondary">Zu den Freunden</ButtonLink>
          </>
        )}
      </div>
    </Card>
  );
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(String(params.code ?? ""));
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (data.user) setSignedIn(true);
      else { storePendingInvite(code); router.replace("/login"); }
    });
    return () => { alive = false; };
  }, [code, router]);

  if (!signedIn) {
    return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p role="status" className="flex items-center gap-3 font-display text-xl font-bold tracking-[-.01em]"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einladung wird geöffnet …</p></main>;
  }
  return <WorkspaceShell active="Freunde"><InviteContent code={code} /></WorkspaceShell>;
}
