"use client";

import Link from "next/link";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, GraduationCap, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { oauthErrorMessage, passwordHint, safeNextPath } from "@/lib/ux";
import { authErrorMessage as authMessage } from "@/lib/auth-errors";
import { pendingInvitePath } from "@/components/friends/shared";
import { resolveLanding } from "@/lib/role";
import { InviteBanner } from "@/components/onboarding/invite-banner";
import { LoginValueProp } from "@/components/onboarding/login-value-prop";
import { AuthBrand } from "@/components/onboarding/auth-frame";
import { DoodleArrow, DoodleBurst, DoodlePlane, DoodleTrail } from "@/components/ui/doodles";

type AuthMode = "login" | "signup";
type Role = "student" | "teacher";

const roles: { value: Role; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: "student", label: "Schüler:in", hint: "Ich bewerbe mich", icon: UserRound },
  { value: "teacher", label: "Lehrperson", hint: "Ich begleite Klassen", icon: GraduationCap },
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
    <main className="workspace-bg min-h-[100dvh] overflow-x-clip px-4 pb-10 sm:px-6">
      <div className="mx-auto grid w-full max-w-[1080px] lg:min-h-[100dvh] lg:grid-cols-[1.15fr_minmax(0,430px)] lg:items-center lg:gap-16">
        {/* Setting off: logo, one loud line, what you get. No hero panel, it all sits on paper. */}
        <section className="animate-rise relative pt-4 lg:pb-16 lg:pt-0">
          <AuthBrand className="h-12 lg:h-auto" />
          <h1 className="mt-5 text-display lg:mt-12 lg:text-[clamp(3.5rem,5.4vw,4.75rem)] lg:leading-[.95] lg:tracking-[-.04em]">
            {isSignup ? <>Konto <span className="marker">erstellen</span></> : <>Schön, dass du <span className="marker">da bist.</span></>}
            <DoodleBurst className="ml-2 inline-block h-[.5em] w-[.5em] -translate-y-[.15em] text-[var(--coral)]" />
          </h1>
          <LoginValueProp />
          <span className="sticker sticker-coral tilt-l3 absolute right-1 top-5 lg:static lg:mt-10">Gratis für Schüler:innen</span>
          <div className="pointer-events-none absolute -bottom-2 right-4 hidden items-end gap-1 text-[var(--brand)] lg:flex" aria-hidden>
            <DoodleTrail className="h-12 w-36" />
            <DoodlePlane className="mb-6 h-12 w-16" />
          </div>
        </section>

        <section className="animate-rise relative mt-6 w-full max-w-[430px] justify-self-center lg:mt-0 lg:py-10">
          <InviteBanner />
          <DoodleArrow className="absolute -left-14 top-6 hidden h-12 w-16 text-[var(--ink)] lg:block" />

          <form onSubmit={submit} className="panel space-y-5 p-5 shadow-[var(--shadow-lg)] sm:p-7">
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            {success && <StatusMessage tone="success" icon={<CheckCircle2 />}>{success}</StatusMessage>}

            {isSignup && (
              <fieldset>
                <legend className="mb-2 block text-sm font-semibold">Ich bin</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {roles.map(({ value, label, hint, icon: Icon }) => {
                    const selected = role === value;
                    return (
                      <label key={value} className={`relative flex min-h-[76px] cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[var(--radius-lg)] border-[length:var(--border-w)] p-3 transition-[transform,box-shadow,background-color] duration-150 focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] active:translate-y-px ${selected ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--field-border)] bg-[var(--field-bg)] hover:bg-[var(--surface-2)]"}`}>
                        <input type="radio" name="role" value={value} checked={selected} onChange={() => setRole(value)} className="sr-only" />
                        <span className="flex items-center gap-1.5 text-sm font-bold"><Icon size={16} strokeWidth={2.2} />{label}</span>
                        <span className={`text-xs ${selected ? "" : "text-muted"}`}>{hint}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <button type="button" onClick={() => signInWithProvider("google")} disabled={loading} className="btn-google pressable flex min-h-12 w-full items-center justify-center gap-3 rounded-full border-[length:var(--border-w)] border-[var(--outline)] px-4 text-[15px] font-semibold shadow-[var(--shadow-sm)] disabled:pointer-events-none disabled:opacity-60">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.9 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
              Weiter mit Google
            </button>
            <div className="flex items-center gap-3 text-xs font-medium text-muted" aria-hidden><span className="flex-1 border-t-2 border-dashed border-[var(--line)]" />oder mit E-Mail<span className="flex-1 border-t-2 border-dashed border-[var(--line)]" /></div>

            <Field label="E-Mail-Adresse" htmlFor="email">
              <Input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="du@beispiel.ch" />
            </Field>
            <Field label="Passwort" htmlFor="password" hint={hint?.label || undefined}>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} required minLength={6} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Mindestens 6 Zeichen" : "Dein Passwort"} className="pr-12" aria-describedby={hint?.label ? "password-hint" : undefined} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-[var(--ink)]">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </Field>
            {!isSignup && <p className="-mt-3 text-right"><button type="button" onClick={forgotPassword} disabled={loading} className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)] disabled:opacity-60">Passwort vergessen?</button></p>}
            {isSignup && (
              <Field label="Passwort wiederholen" htmlFor="confirm-password">
                <Input id="confirm-password" type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
            )}

            <Button type="submit" size="lg" full loading={loading}>
              {loading ? "Einen Moment …" : isSignup ? "Konto erstellen" : "Anmelden"}{!loading && <ArrowRight size={16} strokeWidth={2.4} />}
            </Button>

            <p className="border-t-2 border-dashed border-[var(--line)] pt-4 text-center text-sm text-muted">
              {isSignup ? "Du hast schon ein Konto?" : "Noch kein Konto?"}{" "}
              <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")} className="inline-flex min-h-11 items-center px-1 font-bold text-[var(--ink)] underline decoration-[var(--sun)] decoration-[3px] underline-offset-4 hover:decoration-[var(--ink)]">{isSignup ? "Anmelden" : "Konto erstellen"}</button>
            </p>
          </form>
          <p className="mt-6 text-center text-xs text-muted">Deine Daten bleiben in deinem persönlichen Konto.</p>
          <p className="mt-2 text-center text-xs text-muted"><Link href="/datenschutz" className="underline underline-offset-2">Datenschutz</Link> · <Link href="/datenschutz-jugend" className="underline underline-offset-2">Datenschutz für Jugendliche</Link> · <Link href="/impressum" className="underline underline-offset-2">Impressum</Link></p>
        </section>
      </div>
    </main>
  );
}
