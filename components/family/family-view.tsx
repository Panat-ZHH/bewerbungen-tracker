"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Heart, Mail, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { onlinePaymentEnabled } from "@/components/billing/logic";
import { FAMILY_COPY } from "@/lib/family-copy";
import { supabase } from "@/lib/supabase";
import { getMyFamily, syncPendingAccountType } from "@/lib/family";
import { familyError, isParentMeta, type MyFamily } from "@/lib/family-core";
import { ChildView } from "./child-view";
import { ParentView } from "./parent-view";
import { ParentStart } from "./parent-start";
import { RequestAccessModal } from "./plan-card";
import { StudentStart } from "./student-start";

/**
 * /familie: parent dashboard or child side, depending on the role in the family (or, without a family, the account type).
 * Without the family RPCs it shows "nicht erreichbar" (flag on) or the old "bald verfügbar" + Zugang anfragen (flag off).
 * Root carries data-family-state (loading | error | unavailable | parent-start | parent | child-start | child).
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

  const online = onlinePaymentEnabled();
  const ready = family && family !== "loading" ? family : null;
  const state = error ? "error" : family === "loading" ? "loading" : family === undefined ? "unavailable" : !ready ? (isParent ? "parent-start" : "child-start") : ready.myRole === "parent" ? "parent" : "child";

  return (
    <div className="space-y-6" data-family-state={state}>
      <PageHeader title={<>Meine <span className="marker">Familie</span></>} description={isParent ? FAMILY_COPY.page.leadParent : FAMILY_COPY.page.leadChild} />
      {error && (
        <div className="space-y-3">
          <StatusMessage tone="danger"><strong className="block">{FAMILY_COPY.page.loadError}</strong>{error}</StatusMessage>
          <Button onClick={load} icon={<RefreshCw size={16} aria-hidden />} data-primary-action="">{FAMILY_COPY.page.retry}</Button>
        </div>
      )}
      {family === "loading" && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-32 rounded-[var(--radius-lg)]" /><Skeleton className="h-48 rounded-[var(--radius-lg)]" /></div>}
      {family === undefined && (online ? <Unavailable onRetry={load} /> : <ComingSoon email={email} parent={isParent} />)}
      {family === null && !error && (isParent ? <ParentStart email={email} initialCode={initialCode} onChanged={load} /> : <StudentStart initialCode={initialCode} onChanged={load} />)}
      {ready && (
        ready.myRole === "parent"
          ? <ParentView family={ready} email={email} onChanged={load} initialCode={initialCode} />
          : <ChildView family={ready} me={ready.members.find((m) => m.userId === user?.id) ?? null} email={email} onChanged={load} />
      )}
      {ready && <p className="flex items-start gap-2 text-small text-muted"><Download size={15} className="mt-0.5 shrink-0" aria-hidden /><span>Deine Familiendaten sind im Export unter <Link href="/settings" className="font-semibold underline underline-offset-2">Einstellungen › Meine Daten</Link> enthalten.</span></p>}
    </div>
  );
}

/** Flag on: the family RPCs are not reachable. Honest and short, never "bald verfügbar" (S7). */
function Unavailable({ onRetry }: { onRetry: () => void }) {
  return <EmptyState icon={<Heart size={26} />} title={FAMILY_COPY.page.unavailableTitle} description={FAMILY_COPY.page.unavailableText}
    action={<Button onClick={onRetry} icon={<RefreshCw size={16} aria-hidden />} data-primary-action="">{FAMILY_COPY.page.retry}</Button>} />;
}

/** Flag off: the family migration is not deployed yet (honest "bald verfügbar" + "Zugang anfragen", unchanged). */
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
