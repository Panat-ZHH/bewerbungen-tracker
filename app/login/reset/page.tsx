"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { newPasswordProblem } from "@/lib/password-policy";
import { parseRecoveryLink } from "@/lib/recovery-link";
import { authErrorMessage as authMessage } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { AuthFrame, AuthTitle } from "@/components/onboarding/auth-frame";

/** Target of the "Passwort zurücksetzen" e-mail link: Supabase opens a recovery session, here the user picks a new password. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [invalidReason, setInvalidReason] = useState<"used" | "other-browser" | "other">("used");

  useEffect(() => {
    const link = parseRecoveryLink(window.location.search, window.location.hash);
    if (link.kind === "error") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable on the client, after hydration
      setInvalidReason(link.code === "otp_expired" || link.code === "access_denied" ? "used" : "other");
      setReady("invalid");
      return;
    }
    if (link.kind === "token_hash") {
      // New link format: the token is redeemed with verifyOtp only when the form is submitted, so it works on any
      // device and mail scanners that open the link don't use it up. Hide it from the address bar / history.
      setTokenHash(link.tokenHash);
      window.history.replaceState(null, "", window.location.pathname);
      setReady("ok");
      return;
    }
    // Old PKCE link (?code=): the client exchanges it on load, which only works in the browser that asked for the reset.
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady("ok"); });
    // the recovery session may already be established when we get here
    const timer = window.setTimeout(() => {
      supabase.auth.getSession().then(({ data: s }) => {
        if (!s.session && link.kind === "code") setInvalidReason("other-browser");
        setReady((state) => (state === "checking" ? (s.session ? "ok" : "invalid") : state));
      });
    }, 800);
    return () => { data.subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const weak = newPasswordProblem(password);
    if (weak) { setError(weak); return; }
    if (password !== confirm) { setError("Die Passwörter stimmen nicht überein."); return; }
    setLoading(true);
    try {
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (verifyError) { setInvalidReason("used"); setReady("invalid"); setLoading(false); return; }
        setTokenHash(null); // now signed in with a recovery session; a retry only needs updateUser
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(authMessage(updateError)); setLoading(false); return; }
      toast({ message: "Dein neues Passwort ist gespeichert." });
      router.replace("/dashboard");
    } catch (reason) { setError(authMessage(reason)); setLoading(false); }
  }

  return (
    <AuthFrame className="max-w-[440px]">
        <AuthTitle title={<>Neues <span className="marker">Passwort</span> festlegen</>}>Wähle ein Passwort mit mindestens acht Zeichen.</AuthTitle>
        {ready === "checking" ? (
          <div role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Link wird geprüft …</div>
        ) : ready === "invalid" ? (
          <div className="panel space-y-4 p-5 sm:p-7">
            <StatusMessage tone="warning">{invalidReason === "other-browser"
              ? "Dieser Link funktioniert nur im Browser, in dem du ihn angefordert hast. Fordere auf der Anmeldeseite einfach einen neuen an."
              : "Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere auf der Anmeldeseite einfach einen neuen an."}</StatusMessage>
            <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]">Zurück zur Anmeldung</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="panel space-y-5 p-5 sm:p-7">
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            <Field label="Neues Passwort" htmlFor="new-password"><Input id="new-password" type="password" required minLength={8} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Passwort wiederholen" htmlFor="new-password-2"><Input id="new-password-2" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <Button type="submit" size="lg" full loading={loading}>{loading ? "Speichert …" : "Passwort speichern"}{!loading && <ArrowRight size={16} strokeWidth={2.4} />}</Button>
          </form>
        )}
    </AuthFrame>
  );
}
