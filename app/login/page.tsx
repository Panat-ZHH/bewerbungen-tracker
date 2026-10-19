"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) router.replace("/dashboard"); });
  }, [router]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      setLoading(false);
      return;
    }
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) {
      setError(authError(result.error.message));
      setLoading(false);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setSuccess("Fast geschafft! Öffne die E-Mail von uns und bestätige dein Konto. Danach kannst du dich anmelden.");
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
  }

  const isSignup = mode === "signup";

  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5 py-10">
      <div className="w-full max-w-[410px]">
        <div className="mb-7 text-center">
          <Image src="/logo.png" alt="WendApply" width={56} height={56} className="mx-auto rounded-[16px] bg-white p-1" priority />
          <h1 className="mt-5 text-2xl font-semibold tracking-[-.5px]">{isSignup ? "Konto erstellen" : "Schön, dass du da bist."}</h1>
          <p className="mt-2 text-sm text-muted">{isSignup ? "Behalte deine Bewerbungen an einem Ort." : "Melde dich an und behalte deine Suche im Blick."}</p>
        </div>

        <form onSubmit={submit} className="glass-surface rounded-[16px] p-5 sm:p-7">
          {error && <p role="alert" className="mb-5 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}
          {success && <p role="status" className="mb-5 flex gap-2 rounded-xl border border-[#c5dfcf] bg-[#f1faf4] px-4 py-3 text-sm leading-5 text-[#246c40]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{success}</p>}

          <label className="mb-2 block text-sm font-medium" htmlFor="email">E-Mail-Adresse</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="du@beispiel.ch" className="min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-[#737378] focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15" />

          <label className="mb-2 mt-5 block text-sm font-medium" htmlFor="password">Passwort</label>
          <input id="password" type="password" required minLength={6} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Mindestens 6 Zeichen" : "Dein Passwort"} className="min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-[#737378] focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15" />

          {isSignup && <>
            <label className="mb-2 mt-5 block text-sm font-medium" htmlFor="confirm-password">Passwort wiederholen</label>
            <input id="confirm-password" type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15" />
          </>}

          <button disabled={loading} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white hover:bg-[#075bbb] disabled:opacity-60">
            {loading ? "Einen Moment …" : isSignup ? "Konto erstellen" : "Anmelden"}<ArrowRight size={16} />
          </button>

          <p className="mt-6 border-t border-[#e5e5ea] pt-5 text-center text-sm text-muted">
            {isSignup ? "Du hast schon ein Konto?" : "Noch kein Konto?"}{" "}
            <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")} className="font-semibold text-[#0866d6] hover:underline">{isSignup ? "Anmelden" : "Konto erstellen"}</button>
          </p>
        </form>
        <p className="mt-5 text-center text-xs text-muted">Deine Daten bleiben in deinem persönlichen Konto.</p>
      </div>
    </main>
  );
}

function authError(message: string) {
  if (message.includes("Invalid login credentials")) return "E-Mail oder Passwort stimmt nicht. Versuch es noch einmal.";
  if (message.includes("User already registered")) return "Für diese E-Mail gibt es schon ein Konto. Melde dich an.";
  if (message.includes("Password should be at least")) return "Dein Passwort muss mindestens sechs Zeichen haben.";
  return "Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es noch einmal.";
}