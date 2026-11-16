"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, Heart, Mail, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/teacher/shared";
import { supabase } from "@/lib/supabase";
import { createFamily, getMyFamily, syncPendingAccountType } from "@/lib/family";
import { familyError, isParentMeta, type MyFamily } from "@/lib/family-core";
import { ChildView } from "./child-view";
import { ParentView } from "./parent-view";
import { InvitePanel, JoinForm } from "./invite-panel";
import { PlanCard, RequestAccessModal } from "./plan-card";

/**
 * /familie: parent dashboard or child side, depending on the role in the family (or, without a family, the account type).
 * Without the family migration on the database (RPC missing) it shows a friendly "bald verfügbar" state instead.
 */
export function FamilyView({ initialCode = "" }: { initialCode?: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [family, setFamily] = useState<MyFamily | null | undefined | "loading">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      await syncPendingAccountType(data.user);
      setFamily(await getMyFamily(data.user?.id));
    } catch (e) { setError(familyError(e)); setFamily(null); }
  }, []);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- loads server state once

  const isParent = family && family !== "loading" ? family.myRole === "parent" : isParentMeta(user?.user_metadata);
  const email = user?.email ?? "";

  return (
    <div className="space-y-6">
      <PageHeader title={<>Meine <span className="marker">Familie</span></>} description={isParent ? "Begleite dein Kind bei der Lehrstellensuche. Du siehst nur, was dein Kind mit dir teilt." : "Zeig deinen Eltern, wie weit du bist. Du entscheidest, was sie sehen."} />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {family === "loading" && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-32 rounded-[var(--radius-lg)]" /><Skeleton className="h-48 rounded-[var(--radius-lg)]" /></div>}
      {family === undefined && <ComingSoon email={email} parent={isParent} />}
      {family === null && !error && <NoFamily parent={isParent} email={email} initialCode={initialCode} onChanged={load} />}
      {family && family !== "loading" && (
        family.myRole === "parent"
          ? <ParentView family={family} email={email} onChanged={load} />
          : <ChildView family={family} me={family.members.find((m) => m.userId === user?.id) ?? null} email={email} onChanged={load} />
      )}
      {family && family !== "loading" && <p className="flex items-start gap-2 text-small text-muted"><Download size={15} className="mt-0.5 shrink-0" aria-hidden /><span>Deine Familiendaten sind im Export unter <Link href="/settings" className="font-semibold underline underline-offset-2">Einstellungen › Meine Daten</Link> enthalten.</span></p>}
    </div>
  );
}

function ComingSoon({ email, parent }: { email: string; parent: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EmptyState icon={<Heart size={26} />} title="Familien-Funktion bald verfügbar" description={parent ? "Bald kannst du hier dein Kind einladen und seinen Fortschritt sehen. Wir melden uns gern, sobald es so weit ist." : "Bald kannst du hier deine Eltern einladen und selbst bestimmen, was sie sehen. Bis dahin funktioniert alles andere wie gewohnt."}
        action={<Button variant="sun" onClick={() => setOpen(true)} icon={<Mail size={16} />}>Zugang anfragen</Button>} />
      <RequestAccessModal open={open} onClose={() => setOpen(false)} email={email} kind={parent ? "family" : "student"} />
    </>
  );
}

function NoFamily({ parent, email, initialCode, onChanged }: { parent: boolean; email: string; initialCode: string; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await createFamily(name.trim() || "Meine Familie"); onChanged(); } catch (e) { setError(familyError(e)); setBusy(false); }
  }
  if (!parent) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <JoinForm initialCode={initialCode} onJoined={onChanged} title="Code von deinen Eltern" intro="Hast du von deiner Mutter oder deinem Vater einen Code oder Link bekommen? Gib ihn hier ein." />
        <InvitePanel direction="child_invites_parent" />
        <p className="text-small text-muted lg:col-span-2">Bist du unter 16? Dann muss ein Elternteil zuerst zustimmen, bevor deine Familie etwas sieht. WendApply kannst du trotzdem sofort nutzen.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={create} aria-labelledby="create-family" className="panel-flat space-y-3 p-5">
        <h2 id="create-family" className="text-heading"><Users size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familie erstellen</h2>
        <p className="text-body text-muted">Erstelle zuerst deine Familie. Danach lädst du dein Kind mit einem Code ein.</p>
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
        <Field label="Name der Familie" htmlFor="family-name" hint="Zum Beispiel «Familie Meier»"><Input id="family-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" /></Field>
        <Button type="submit" loading={busy}>Familie erstellen</Button>
      </form>
      <div className="space-y-6">
        <JoinForm initialCode={initialCode} onJoined={onChanged} title="Code von deinem Kind" intro="Hat dein Kind dich eingeladen? Gib den Code hier ein." />
        <PlanCard plan={null} email={email} />
      </div>
    </div>
  );
}
