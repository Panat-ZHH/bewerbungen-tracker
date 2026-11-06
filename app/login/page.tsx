"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, CheckCircle2, Eye, EyeOff, GraduationCap, MapPin, ShieldCheck, UserRound, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { authMessage, oauthErrorMessage, passwordHint, safeNextPath } from "@/lib/ux";
import { pendingInvitePath } from "@/components/friends/shared";
import { resolveLanding } from "@/lib/role";

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
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Error handed over by /auth/callback (or by Supabase directly, in the query or the hash).
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("deleted") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable on the client, after hydration
      setSuccess("Dein Konto und alle deine Daten wurden gelöscht. Danke, dass du WendApply genutzt hast.");
      window.history.replaceState(null, "", "/login");
      return;
    }
    const message = oauthErrorMessage(params) ?? oauthErrorMessage(hash);
    if (message) {
      setError(message);
      window.history.replaceState(null, "", params.get("next") ? `/login?next=${encodeURIComponent(params.get("next")!)}` : "/login");
    }
    supabase.auth.getUser().then(({ data }) => { if (data.user) goHome(); });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps -- goHome only uses router

  /** Role-aware landing: teacher -> /teacher, student -> /dashboard (or the safe ?next= / a waiting class invite). */
  async function goHome() {
    const requested = new URLSearchParams(window.location.search).get("next");
    router.replace(await resolveLanding(safeNextPath(requested) ?? pendingInvitePath()));
  }

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
    let result;
    try {
      result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { role } } });
    } catch (reason) {
      setError(authMessage(reason));
      setLoading(false);
      return;
    }
    if (result.error) {
      setError(authMessage(result.error));
      setLoading(false);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setSuccess("Fast geschafft! Öffne die E-Mail von uns und bestätige dein Konto. Danach kannst du dich anmelden.");
      setLoading(false);
      return;
    }
    await goHome();
  }

  async function signInWithProvider(provider: "google") {
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (oauthError) { setError(authMessage(oauthError)); setLoading(false); }
      // On success the browser is redirected to the provider; the session is picked up on return.
    } catch (reason) { setError(authMessage(reason)); setLoading(false); }
  }

  async function forgotPassword() {
    setError(""); setSuccess("");
    if (!email.trim()) { setError("Trag oben deine E-Mail-Adresse ein. Dann schicken wir dir einen Link zum Zurücksetzen."); document.getElementById("email")?.focus(); return; }
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login/reset` });
      if (resetError) { setError(authMessage(resetError)); }
      else setSuccess("Falls es ein Konto mit dieser Adresse gibt, haben wir dir einen Link zum Zurücksetzen geschickt. Schau auch im Spam-Ordner nach.");
    } catch (reason) { setError(authMessage(reason)); }
    setLoading(false);
  }

  const isSignup = mode === "signup";
  const hint = isSignup ? passwordHint(password) : null;

  return (
    <main className="workspace-bg min-h-[100dvh] lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden [clip-path:inset(0)] bg-[image:var(--brand-gradient)] p-12 text-white lg:flex lg:flex-col lg:justify-between" aria-hidden>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <BrandMark size={44} radius={13} pad={4} fixedTile />
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
            <BrandMark size={56} radius={16} pad={4} white className="brand-mark-raised mx-auto lg:hidden" priority />
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

            <button type="button" onClick={() => signInWithProvider("google")} disabled={loading} className="btn-google flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border px-4 text-sm font-semibold shadow-[var(--shadow-sm)] transition active:scale-[.98] disabled:opacity-60">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.9 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
              Weiter mit Google
            </button>
            <div className="flex items-center gap-3 text-xs text-muted" aria-hidden><span className="h-px flex-1 bg-[var(--line)]" />oder mit E-Mail<span className="h-px flex-1 bg-[var(--line)]" /></div>

            <Field label="E-Mail-Adresse" htmlFor="email">
              <Input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="du@beispiel.ch" />
            </Field>
            <Field label="Passwort" htmlFor="password" hint={hint?.label || undefined}>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Mindestens 6 Zeichen" : "Dein Passwort"} className="pr-12" aria-describedby={hint?.label ? "password-hint" : undefined} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-[var(--ink)]">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </Field>
            {!isSignup && <p className="-mt-3 text-right"><button type="button" onClick={forgotPassword} disabled={loading} className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-60">Passwort vergessen?</button></p>}
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

