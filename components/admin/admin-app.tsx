"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, LogIn } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DoodleLoopArrow } from "@/components/ui/doodles";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { AdminMe } from "@/lib/admin/types";
import { supabase } from "@/lib/supabase";
import { clearSnapshots } from "@/lib/snapshot-cache";
import { accessToken, adminFetch, errorText, setAdminAuthHandler, type AdminAuthKind } from "./api";
import { MfaStep } from "./mfa-step";
import { AdminDashboard } from "./dashboard";

type Phase =
  | { kind: "loading" }
  | { kind: "login"; reauth?: boolean }
  | { kind: "not_found" }
  | { kind: "mfa" }
  | { kind: "error"; message: string }
  | { kind: "ready"; me: AdminMe };

/** The last real login is older than the admin window (403 reauth_required): end this browser's session and ask for a new login. */
async function reauth(setPhase: (p: Phase) => void) {
  clearSnapshots();
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* the login prompt is shown anyway */ }
  setPhase({ kind: "login", reauth: true });
}

/** Gate of /admin: session → /api/admin/me → login prompt / not found / MFA step / dashboard. */
export function AdminApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const check = useCallback(async () => {
    setPhase({ kind: "loading" });
    if (!(await accessToken())) { setPhase({ kind: "login" }); return; }
    const res = await adminFetch<AdminMe>("/api/admin/me");
    if (res.ok) setPhase({ kind: "ready", me: res.data });
    else if (res.status === 404) setPhase({ kind: "not_found" });
    else if (res.status === 401) setPhase({ kind: "login" });
    else if (res.status === 403 && (res.data as { error?: string } | null)?.error === "reauth_required") await reauth(setPhase);
    else if (res.status === 403) setPhase({ kind: "mfa" });
    else setPhase({ kind: "error", message: errorText(res) });
  }, []);

  useEffect(() => {
    // Any later call that reports 401 / mfa_required switches the page back to the matching step.
    setAdminAuthHandler((kind: AdminAuthKind) => {
      if (kind === "reauth") void reauth(setPhase);
      else setPhase(kind === "mfa" ? { kind: "mfa" } : { kind: "login" });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    return () => setAdminAuthHandler(null);
  }, [check]);

  switch (phase.kind) {
    case "loading":
      return (
        <div aria-busy="true" className="space-y-4">
          <p role="status" className="sr-only">Wird geladen …</p>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    case "login":
      return (
        <Card className="mx-auto mt-6 max-w-md" data-testid="admin-login-prompt">
          <CardContent className="space-y-4">
            <h1 className="text-title">{phase.reauth ? "Bitte melde dich erneut an" : "Bitte melde dich zuerst an"}</h1>
            <p className="text-body text-muted">
              {phase.reauth ? "Deine letzte Anmeldung ist zu lange her. Zum Schutz der Admin-Daten braucht es eine frische Anmeldung." : "Danach kannst du hier weitermachen."}
            </p>
            <ButtonLink href="/login?next=%2Fadmin" icon={<LogIn size={18} strokeWidth={2.4} aria-hidden />}>Zum Login</ButtonLink>
          </CardContent>
        </Card>
      );
    case "not_found":
      return (
        <div className="animate-rise mx-auto mt-6 max-w-lg" data-testid="admin-not-found">
          <div className="flex items-end gap-3" aria-hidden>
            <span className="num-display tilt-l3 inline-block rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] px-4 pb-2 pt-3 text-[var(--on-sun)] shadow-[var(--shadow-lg)]">404</span>
            <DoodleLoopArrow className="mb-2 h-10 w-20 text-[var(--brand)]" />
          </div>
          <h1 className="text-display mt-8">Seite nicht gefunden</h1>
          <p className="mt-4 text-lg text-muted">Diese Seite gibt es nicht. Vielleicht hat sich der Link geändert.</p>
          <div className="mt-8">
            <ButtonLink href="/" size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Zur Startseite</ButtonLink>
          </div>
        </div>
      );
    case "mfa":
      return <MfaStep onDone={check} />;
    case "error":
      return (
        <div className="mx-auto mt-6 max-w-md space-y-4">
          <StatusMessage tone="danger">{phase.message}</StatusMessage>
          <Button variant="secondary" onClick={() => void check()}>Nochmals versuchen</Button>
        </div>
      );
    case "ready":
      return <AdminDashboard me={phase.me} />;
  }
}
