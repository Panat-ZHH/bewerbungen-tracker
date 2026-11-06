"use client";

import { BrandMark } from "@/components/ui/brand-mark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { StatusMessage } from "@/components/ui/skeleton";
import { authMessage, oauthErrorMessage, safeNextPath } from "@/lib/ux";
import { resolveLanding } from "@/lib/role";

/**
 * Return point of "Weiter mit Google" (redirectTo = <origin>/auth/callback?next=…).
 * This is a client page on purpose: the PKCE code verifier sits in this browser's storage, so the code can only be
 * exchanged here, not in a server route. The Supabase client exchanges ?code= itself while it initialises
 * (detectSessionInUrl); getSession() waits for that and reports its result. Doing a second exchangeCodeForSession
 * would fail because the verifier is already consumed.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const next = safeNextPath(params.get("next"));
    const go = () => resolveLanding(next).then((path) => { if (active) router.replace(path); }).catch(() => { if (active) router.replace(next ?? "/dashboard"); });
    const fail = (message: string) => { if (active) setError(message); };

    const providerError = oauthErrorMessage(params) ?? oauthErrorMessage(new URLSearchParams(window.location.hash.replace(/^#/, "")));
    if (providerError) { fail(providerError); return () => { active = false; }; }
    if (!params.get("code") && !window.location.hash.includes("access_token")) {
      // Opened without a code (bookmark, reload after success, back button): fine if already signed in.
      supabase.auth.getSession().then(({ data }) => { if (!active) return; if (data.session) go(); else fail("Die Anmeldung ist abgelaufen oder wurde nicht abgeschlossen. Bitte versuch es noch einmal."); });
      return () => { active = false; };
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) return fail(oauthErrorMessage(`error_description=${sessionError.message}`) ?? authMessage(sessionError));
      if (!data.session) return fail("Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser gestartet. Bitte versuch es noch einmal.");
      go();
    }).catch((reason) => fail(authMessage(reason)));
    return () => { active = false; };
  }, [router]);

  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="animate-rise w-full max-w-[420px] text-center">
        <BrandMark size={56} radius={16} pad={4} white className="brand-mark-raised mx-auto" priority />
        {error ? (
          <div className="glass-surface mt-6 space-y-4 p-6">
            <StatusMessage tone="danger">{error}</StatusMessage>
            <Link href="/login" className="inline-flex min-h-11 items-center justify-center font-semibold text-[var(--brand)] hover:underline">Zurück zur Anmeldung</Link>
          </div>
        ) : (
          <div role="status" className="mt-6 text-sm text-muted">Du wirst angemeldet …</div>
        )}
      </div>
    </main>
  );
}
