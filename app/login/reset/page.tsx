"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { authErrorMessage as authMessage } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";

/** Target of the "Passwort zurücksetzen" e-mail link: Supabase opens a recovery session, here the user picks a new password. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady("ok"); });
    // the recovery session may already be established when we get here
    const timer = window.setTimeout(() => { supabase.auth.getSession().then(({ data: s }) => setReady((state) => (state === "checking" ? (s.session ? "ok" : "invalid") : state))); }, 800);
    return () => { data.subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 6) { setError("Dein Passwort muss mindestens sechs Zeichen haben."); return; }
    if (password !== confirm) { setError("Die Passwörter stimmen nicht überein."); return; }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(authMessage(updateError)); setLoading(false); return; }
      toast({ message: "Dein neues Passwort ist gespeichert." });
      router.replace("/dashboard");
    } catch (reason) { setError(authMessage(reason)); setLoading(false); }
  }

  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="animate-rise w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="WendApply" width={56} height={56} className="mx-auto rounded-[16px] bg-white p-1 shadow-[var(--shadow-md)]" priority />
          <h1 className="text-title mt-5">Neues Passwort festlegen</h1>
          <p className="mt-2 text-sm text-muted">Wähle ein Passwort mit mindestens sechs Zeichen.</p>
        </div>
        {ready === "checking" ? (
          <div role="status" className="panel p-6 text-center text-sm text-muted">Link wird geprüft …</div>
        ) : ready === "invalid" ? (
          <div className="panel space-y-4 p-6 text-center">
            <StatusMessage tone="warning">Dieser Link ist abgelaufen oder wurde schon benutzt.</StatusMessage>
            <Link href="/login" className="inline-flex min-h-11 items-center justify-center font-semibold text-[var(--brand)] hover:underline">Zurück zur Anmeldung</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="panel space-y-5 p-5 sm:p-7">
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            <Field label="Neues Passwort" htmlFor="new-password"><Input id="new-password" type="password" required minLength={6} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Passwort wiederholen" htmlFor="new-password-2"><Input id="new-password-2" type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <Button type="submit" size="lg" full loading={loading}>{loading ? "Speichert …" : "Passwort speichern"}{!loading && <ArrowRight size={16} />}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
