"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, CheckCircle2, GraduationCap, MapPin, ShieldCheck, UserRound, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";

type AuthMode = "login" | "signup";
type Role = "student" | "teacher";

const roles: { value: Role; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: "student", label: "Schüler:in", hint: "Ich bewerbe mich", icon: UserRound },
  { value: "teacher", label: "Lehrperson", hint: "Ich begleite Klassen", icon: GraduationCap },
];

const highlights = [
  { icon: BarChart3, text: "Alle Bewerbungen und Status an einem Ort" },
  { icon: MapPin, text: "Betriebe auf der Karte finden" },
  { icon: Users, text: "Gemeinsam mit Freunden und Klassen dranbleiben" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) router.replace(nextPath()); });
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
      : await supabase.auth.signUp({ email, password, options: { data: { role } } });
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
    router.replace(nextPath());
  }

  const isSignup = mode === "signup";

  return (
    <main className="workspace-bg min-h-[100dvh] lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden [clip-path:inset(0)] bg-[image:var(--brand-gradient)] p-12 text-white lg:flex lg:flex-col lg:justify-between" aria-hidden>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Image src="/logo.png" alt="" width={44} height={44} className="rounded-[13px] bg-white p-1 shadow-[var(--shadow-md)]" />
          <span className="text-lg font-semibold tracking-[-.02em]">WendApply</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-display">Bewerbungen einfach im Blick.</h2>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-white/90">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><Icon size={17} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-white/75"><ShieldCheck size={16} /> Deine Daten bleiben in deinem persönlichen Konto.</p>
      </aside>

      <section className="flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="animate-rise w-full max-w-[420px]">
          <div className="mb-6 text-center sm:mb-7">
            <Image src="/logo.png" alt="WendApply" width={56} height={56} className="mx-auto rounded-[16px] bg-white p-1 shadow-[var(--shadow-md)] lg:hidden" priority />
            <h1 className="text-title mt-5 lg:mt-0">{isSignup ? "Konto erstellen" : "Schön, dass du da bist."}</h1>
            <p className="mt-2 text-sm text-muted">{isSignup ? "Behalte deine Bewerbungen an einem Ort." : "Melde dich an und behalte deine Suche im Blick."}</p>
          </div>

          <form onSubmit={submit} className="glass-surface space-y-5 p-5 sm:p-7">
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            {success && <StatusMessage tone="success" icon={<CheckCircle2 />}>{success}</StatusMessage>}

            {isSignup && (
              <fieldset>
                <legend className="mb-2 block text-sm font-medium">Ich bin</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {roles.map(({ value, label, hint, icon: Icon }) => {
                    const selected = role === value;
                    return (
                      <label key={value} className={`relative flex min-h-[76px] cursor-pointer flex-col items-start justify-center gap-0.5 rounded-xl border p-3 transition duration-200 focus-within:ring-4 focus-within:ring-[var(--brand)]/20 active:scale-[.98] ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[var(--shadow-sm)]" : "border-[var(--field-border)] bg-[var(--field-bg)] hover:border-[#b8b8c0]"}`}>
                        <input type="radio" name="role" value={value} checked={selected} onChange={() => setRole(value)} className="sr-only" />
                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${selected ? "text-[var(--brand-strong)]" : ""}`}><Icon size={15} />{label}</span>
                        <span className="text-xs text-muted">{hint}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <Field label="E-Mail-Adresse" htmlFor="email">
              <Input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="du@beispiel.ch" />
            </Field>
            <Field label="Passwort" htmlFor="password">
              <Input id="password" type="password" required minLength={6} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Mindestens 6 Zeichen" : "Dein Passwort"} />
            </Field>
            {isSignup && (
              <Field label="Passwort wiederholen" htmlFor="confirm-password">
                <Input id="confirm-password" type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
            )}

            <Button type="submit" size="lg" full loading={loading}>
              {loading ? "Einen Moment …" : isSignup ? "Konto erstellen" : "Anmelden"}{!loading && <ArrowRight size={16} />}
            </Button>

            <p className="border-t border-[var(--line)] pt-5 text-center text-sm text-muted">
              {isSignup ? "Du hast schon ein Konto?" : "Noch kein Konto?"}{" "}
              <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")} className="inline-flex min-h-11 items-center px-1 font-semibold text-[var(--brand)] hover:underline">{isSignup ? "Anmelden" : "Konto erstellen"}</button>
            </p>
          </form>
          <p className="mt-5 text-center text-xs text-muted lg:hidden">Deine Daten bleiben in deinem persönlichen Konto.</p>
        </div>
      </section>
    </main>
  );
}

/** Where to go after login: a safe same-site path from ?next=, else the dashboard. */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/dashboard";
}

function authError(message: string) {
  if (message.includes("Invalid login credentials")) return "E-Mail oder Passwort stimmt nicht. Versuch es noch einmal.";
  if (message.includes("User already registered")) return "Für diese E-Mail gibt es schon ein Konto. Melde dich an.";
  if (message.includes("Password should be at least")) return "Dein Passwort muss mindestens sechs Zeichen haben.";
  return "Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es noch einmal.";
}
