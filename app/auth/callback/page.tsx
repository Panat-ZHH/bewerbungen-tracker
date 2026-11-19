"use client";

import { AuthFrame } from "@/components/onboarding/auth-frame";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ButtonLink } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/skeleton";
import { authMessage, oauthErrorMessage, safeNextPath } from "@/lib/ux";
import { SavingView, useFunnelSave } from "@/components/funnel/saving";
import { loginHref } from "@/components/funnel/funnel-core";
import { loadFunnelState } from "@/components/funnel/store";
import { readFunnelOAuth } from "@/lib/funnel/storage";

type View = { kind: "signing-in" } | { kind: "error"; message: string } | { kind: "confirmed" } | { kind: "expired" } | { kind: "saving"; plan: boolean };

/**
 * Return point of «Weiter mit Google» and of the confirmation e-mail (redirect = <origin>/auth/callback?next=…[&quelle=email]).
 * Client page on purpose: the PKCE code verifier sits in this browser's storage, so the code can only be exchanged here. The
 * Supabase client exchanges ?code= itself while it initialises (detectSessionInUrl); getSession() waits for that.
 *
 * New states (SPEC-DATA §3.1 step 5–6):
 * - confirmation link opened in another browser / app (no verifier → no session, but the address IS confirmed): «bestätigt – melde dich an»;
 * - session exists → the funnel answers are saved first («Dein Plan wird gespeichert …», retry / «Ohne Plan weiter»), then the landing.
 */
export default function AuthCallbackPage() {
  const [view, setView] = useState<View>({ kind: "signing-in" });
  const [next, setNext] = useState<string | null>(null);
  const saver = useFunnelSave(next, { announceExisting: true });

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const safe = safeNextPath(params.get("next"));
    const fromEmail = params.get("quelle") === "email";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable on the client
    setNext(safe);
    const fail = (message: string) => { if (active) setView({ kind: "error", message }); };
    // «Dein Plan wird gespeichert …» only when answers are waiting: the sign-up metadata copy, or a local copy whose Google
    // sign-in started in the funnel of this tab (QA-ONB-2 N1: a foreign copy on a shared device is dropped, not saved).
    const signedIn = (meta?: Record<string, unknown> | null) => {
      const local = loadFunnelState();
      if (active) setView({ kind: "saving", plan: (!!local && readFunnelOAuth() === local.startedAt) || !!meta?.wa_funnel });
    };

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const raw = `${params.get("error_code") ?? ""} ${hash.get("error_code") ?? ""} ${params.get("error_description") ?? ""}`.toLowerCase();
    const providerError = oauthErrorMessage(params) ?? oauthErrorMessage(hash);
    if (providerError) {
      if (fromEmail && /otp_expired|expired|invalid/.test(raw)) setView({ kind: "expired" });
      else fail(providerError);
      return () => { active = false; };
    }
    if (!params.get("code") && !window.location.hash.includes("access_token")) {
      // Opened without a code (bookmark, reload after success, back button): fine if already signed in.
      supabase.auth.getSession().then(({ data }) => { if (!active) return; if (data.session) signedIn(data.session.user.user_metadata); else fail("Die Anmeldung ist abgelaufen oder wurde nicht abgeschlossen. Bitte versuch es noch einmal."); });
      return () => { active = false; };
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (data.session) { signedIn(data.session.user.user_metadata); return; }
      // E-mail link opened in another browser (no PKCE verifier here) – or a made-up / stale code: the exchange gave no session,
      // so this page cannot know whether the address is confirmed (QA L5). Neutral copy, same for every code (no enumeration).
      if (fromEmail) { setView({ kind: "confirmed" }); return; }
      if (sessionError) return fail(oauthErrorMessage(`error_description=${sessionError.message}`) ?? authMessage(sessionError));
      fail("Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser gestartet. Bitte versuch es noch einmal.");
    }).catch((reason) => fail(authMessage(reason)));
    return () => { active = false; };
  }, []);

  const { save } = saver;
  useEffect(() => { if (view.kind === "saving") void save(); }, [view.kind, save]);

  return (
    <AuthFrame className="max-w-[440px]">
      {view.kind === "error" ? (
        <div className="panel space-y-4 p-5 sm:p-7" data-testid="callback-error">
          <StatusMessage tone="danger">{view.message}</StatusMessage>
          <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]">Zurück zur Anmeldung</Link>
        </div>
      ) : view.kind === "confirmed" ? (
        <div className="panel space-y-4 p-5 sm:p-7" data-testid="callback-confirmed">
          <StatusMessage tone="info" icon={<Info />}>Wenn du den Link aus unserer E-Mail geöffnet hast, ist deine Adresse bestätigt. Melde dich jetzt an.</StatusMessage>
          <p className="text-body">Ist sie noch nicht bestätigt, kannst du beim Anmelden eine neue E-Mail anfordern.</p>
          <ButtonLink href={loginHref(next) === "/login" ? "/login?anmelden=1" : loginHref(next)} size="lg" full data-testid="callback-login">Anmelden</ButtonLink>
        </div>
      ) : view.kind === "expired" ? (
        <div className="panel space-y-4 p-5 sm:p-7" data-testid="callback-expired">
          <StatusMessage tone="warning">Dieser Link ist abgelaufen oder wurde schon benutzt. Er gilt eine Stunde.</StatusMessage>
          <p className="text-body">Melde dich mit deiner E-Mail-Adresse und deinem Passwort an. Ist deine Adresse noch nicht bestätigt, kannst du dort eine neue E-Mail anfordern.</p>
          <ButtonLink href={loginHref(next) === "/login" ? "/login?anmelden=1" : loginHref(next)} size="lg" full data-testid="callback-login">Anmelden</ButtonLink>
        </div>
      ) : view.kind === "saving" ? (
        <SavingView phase={saver.phase === "idle" ? "saving" : saver.phase} errorKind={saver.errorKind} onRetry={saver.save} onSkip={saver.skip} label={view.plan ? undefined : "Du wirst angemeldet …"} />
      ) : (
        <div role="status" className="flex items-center gap-3" data-testid="callback-signing-in"><span aria-hidden className="spinner h-5 w-5 shrink-0 text-[var(--brand)]" /><span className="font-display text-2xl font-extrabold tracking-[-.02em]">Du wirst angemeldet …</span></div>
      )}
    </AuthFrame>
  );
}
