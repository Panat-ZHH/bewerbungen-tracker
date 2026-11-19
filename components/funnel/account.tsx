"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/modal";
import { passwordHint } from "@/lib/ux";
import { newPasswordProblem } from "@/lib/password-policy";
import { authErrorMessage } from "@/lib/auth-errors";
import { signupMetadata } from "@/lib/family-core";
import { storePendingSignup } from "@/lib/role";
import { PROFESSION_SUGGESTIONS } from "@/lib/onboarding-core";
import { cantonByCode } from "@/lib/geo/cantons";
import { FAMILY } from "@/components/public/marketing";
import type { FunnelStateV1 } from "@/lib/funnel/types";
import { markFunnelOAuth } from "@/lib/funnel/storage";
import { emailError, mayNeedParentalConsent, planRows, planSummaryLine, signupChoiceOf, type StepSlug } from "./funnel-core";
import { buildPayload, callbackUrl, readConfirmRecord, saveFunnelState, writeConfirmRecord } from "./store";

// ---- §4.4 Dein Plan ----
export function PlanCard({ state, onEdit }: { state: FunnelStateV1; onEdit: (step: StepSlug) => void }) {
  const rows = planRows(state, { suggestions: PROFESSION_SUGGESTIONS, cantonName: (c) => cantonByCode(c)?.name });
  return (
    <div className="space-y-4">
      <p className="text-heading" data-testid="funnel-plan-summary">{planSummaryLine(state, PROFESSION_SUGGESTIONS)}</p>
      <dl className="panel divide-y-2 divide-dashed divide-[var(--line)] p-0" data-testid="funnel-plan">
        {rows.map((row) => (
          <div key={row.key} data-row={row.key} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <dt className="text-small text-muted">{row.label}</dt>
              <dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{row.value}</dd>
            </div>
            <button type="button" onClick={() => onEdit(row.step)} className="-mr-2 inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-semibold underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]" aria-label={`${row.label} ändern`}>Ändern</button>
          </div>
        ))}
      </dl>
      {state.role === "parent" && FAMILY.pricePerMonth !== null && (
        <p className="text-small text-muted">Danach {FAMILY.name} für {FAMILY.priceMonthText} pro Monat. Bezahlen musst du erst, wenn du weitermachen willst.</p>
      )}
    </div>
  );
}

// ---- §2.7 / SPEC-DATA §3.14 «Was wir speichern» ----
export function DataSheet({ open, onClose, role }: { open: boolean; onClose: () => void; role: FunnelStateV1["role"] }) {
  const pupil = role === "student";
  return (
    <Sheet open={open} onClose={onClose} title="Was wir speichern">
      <ul className="list-disc space-y-2 pl-5 text-body" data-testid="funnel-data-sheet">
        <li>Vorname: damit wir dich ansprechen können.</li>
        {pupil && <li>Geburtsjahr: nur das Jahr. Damit wir wissen, ob deine Eltern zustimmen müssen, bevor sie etwas sehen.</li>}
        {pupil && <li>Klasse, Kanton, Ort, Wunschberufe, Lehrbeginn: damit die Suche passende Lehrstellen zeigt.</li>}
        {pupil && <li>Wochenziel und Hilfe-Wünsche: damit dein Dashboard zu deinem Plan passt.</li>}
        {role === "parent" && <li>Wobei du dein Kind begleiten möchtest: damit du zuerst siehst, was dir wichtig ist.</li>}
        <li>E-Mail-Adresse und Passwort: für die Anmeldung. Das Passwort ist verschlüsselt gespeichert, niemand kann es lesen.</li>
        <li>Deine Antworten bleiben auf diesem Gerät, bis du dein Konto erstellst. Mit «Konto erstellen» schicken wir sie zusammen mit deiner E-Mail-Adresse an WendApply und speichern sie in deinem Konto.</li>
        <li>Unsere Datenbank steht in Irland (EU). Keine Werbung, kein Verkauf von Daten, kein Tracking.</li>
        <li>Du kannst alles in der App ändern und dein Konto jederzeit selbst löschen. Dann sind deine Daten weg.</li>
      </ul>
      <p className="mt-4 text-small">
        <Link href="/datenschutz" className="font-semibold underline underline-offset-4">Datenschutzerklärung</Link>{" · "}
        <Link href="/datenschutz-jugend" className="font-semibold underline underline-offset-4">Datenschutz für Jugendliche</Link>
      </p>
    </Sheet>
  );
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.9 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
);

type Errors = Partial<Record<"email" | "password" | "consent" | "form", string>>;

/**
 * §4.5 – the LAST screen: Google first, then e-mail + one password field (show/hide) + one consent checkbox that gates both.
 * Never branches on the signUp result except `error` (no account enumeration, SPEC-DATA §3.10): every valid address goes to
 * /start/bestaetigen. `onSession` runs when signUp already returned a session (confirmation off, local dev).
 */
export function AccountScreen({ state, onSession }: { state: FunnelStateV1; onSession: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"" | "email" | "google">("");
  const [errors, setErrors] = useState<Errors>({});
  const [sheet, setSheet] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const teacher = state.role === "staff";
  const choice = signupChoiceOf(state);

  useEffect(() => {
    // «E-Mail-Adresse ändern» on /start/bestaetigen: address prefilled + selected, answers intact.
    const record = readConfirmRecord();
    if (!record) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
    setEmail(record.email);
    requestAnimationFrame(() => { const el = document.getElementById("funnel-email") as HTMLInputElement | null; el?.focus(); el?.select(); });
  }, []);

  function focusFirst(e: Errors) {
    const id = e.email ? "funnel-email" : e.password ? "funnel-password" : e.consent ? "funnel-consent" : null;
    if (Object.keys(e).length > 1) summaryRef.current?.focus();
    else if (id) document.getElementById(id)?.focus();
  }

  function payloadOrError(): ReturnType<typeof buildPayload> {
    const built = buildPayload(state);
    if (!built.ok) setErrors({ form: "Eine Antwort fehlt oder passt nicht. Geh zurück zu «Dein Plan» und prüf sie noch einmal." });
    return built;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const e: Errors = {};
    const mail = emailError(email);
    if (mail) e.email = mail;
    const weak = newPasswordProblem(password, email);
    if (weak) e.password = weak;
    if (!consent) e.consent = "Bestätige zuerst die Datenschutzerklärung.";
    setErrors(e);
    if (Object.keys(e).length) { focusFirst(e); return; }
    const built = payloadOrError();
    if (!built.ok || !choice) return;
    setBusy("email");
    saveFunnelState(state);
    let result;
    try {
      result = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { ...signupMetadata(choice, state.birthYear), wa_funnel: built.payload }, emailRedirectTo: callbackUrl(state.next, { email: true }) },
      });
    } catch (reason) {
      setBusy(""); setErrors({ form: networkOr(reason) }); return;
    }
    if (result.error && !isAlreadyRegistered(result.error)) { setBusy(""); setErrors({ form: networkOr(result.error) }); summaryRef.current?.focus(); return; }
    if (result.data?.session) { onSession(); return; }
    writeConfirmRecord({ email: email.trim(), at: Date.now() });
    router.push("/start/bestaetigen");
  }

  async function google() {
    if (busy) return;
    if (!consent) { const e = { consent: "Bestätige zuerst die Datenschutzerklärung." }; setErrors(e); focusFirst(e); return; }
    const built = payloadOrError();
    if (!built.ok || !choice) return;
    setBusy("google"); setErrors({});
    saveFunnelState(state);
    storePendingSignup(choice, state.birthYear);
    // This tab's OAuth comes from this funnel copy (QA-ONB-2 N1): only then may a new Google account take the local answers.
    markFunnelOAuth(state.startedAt);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(state.next) } });
      if (error) { setBusy(""); setErrors({ form: networkOr(error) }); }
    } catch (reason) { setBusy(""); setErrors({ form: networkOr(reason) }); }
  }

  const hint = passwordHint(password);
  const list = (["email", "password", "consent"] as const).filter((k) => errors[k]);
  const disabled = !!busy;

  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-testid="funnel-account">
      {(list.length > 1 || errors.form) && (
        <div ref={summaryRef} tabIndex={-1} role="alert" data-testid="funnel-account-errors" className="rounded-[var(--radius-md)] border-[length:var(--border-w)] border-[var(--danger-line)] bg-[var(--danger-bg)] px-4 py-3 text-small text-[var(--danger-fg)] outline-none">
          {errors.form ? <p className="font-semibold">{errors.form}</p> : (
            <>
              <p className="font-semibold">Bitte prüf noch:</p>
              <ul className="mt-1 list-disc pl-5">{list.map((k) => <li key={k}><a href={`#funnel-${k}`} className="underline underline-offset-2">{errors[k]}</a></li>)}</ul>
            </>
          )}
        </div>
      )}

      <button type="button" onClick={google} disabled={disabled} data-testid="funnel-google" aria-busy={busy === "google" || undefined}
        className="btn-google pressable flex min-h-12 w-full items-center justify-center gap-3 rounded-full border-[length:var(--border-w)] border-[var(--outline)] px-4 text-[15px] font-semibold shadow-[var(--shadow-sm)] disabled:pointer-events-none disabled:opacity-60">
        {busy === "google" ? <span className="spinner" aria-hidden /> : <GoogleIcon />}Mit Google weiter
      </button>
      <div className="flex items-center gap-3 text-xs font-medium text-muted" aria-hidden><span className="flex-1 border-t-2 border-dashed border-[var(--line)]" />oder mit E-Mail<span className="flex-1 border-t-2 border-dashed border-[var(--line)]" /></div>

      <Field label="E-Mail-Adresse" htmlFor="funnel-email" error={errors.email}>
        <Input id="funnel-email" data-testid="funnel-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next"
          maxLength={254} disabled={disabled} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@beispiel.ch" className="min-h-12 !text-base" />
      </Field>
      <Field label="Passwort" htmlFor="funnel-password" error={errors.password} hint={errors.password ? undefined : hint.label || "Mindestens 8 Zeichen."}>
        <div className="relative">
          <Input id="funnel-password" data-testid="funnel-password" type={show ? "text" : "password"} autoComplete="new-password" enterKeyHint="go" disabled={disabled}
            value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.password ? true : undefined}
            aria-describedby={`funnel-password-${errors.password ? "error" : "hint"}`} className="min-h-12 pr-12 !text-base" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"} className="absolute right-0 top-0.5 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-[var(--ink)]">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
      </Field>

      {state.role === "student" && mayNeedParentalConsent(state.birthYear) && (
        <p role="note" className="rounded-[var(--radius-md)] bg-[var(--info-bg)] px-3 py-2.5 text-small text-[var(--info-fg)]">
          Unter 16? Lies kurz die <Link href="/datenschutz-jugend" target="_blank" className="font-semibold underline underline-offset-2">Datenschutz-Infos für Jugendliche</Link>. Sprich mit deinen Eltern oder deiner Lehrperson, wenn du unsicher bist.
        </p>
      )}
      <div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-sm">
          <input id="funnel-consent" data-testid="funnel-consent" type="checkbox" checked={consent} disabled={disabled} onChange={(e) => { setConsent(e.target.checked); if (e.target.checked) setErrors((x) => ({ ...x, consent: undefined })); }}
            aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? "funnel-consent-error" : undefined} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--brand)]" />
          <span>Ich habe die <Link href="/datenschutz" target="_blank" className="font-semibold underline underline-offset-2">Datenschutzerklärung</Link> gelesen und bin einverstanden.</span>
        </label>
        {errors.consent && <p id="funnel-consent-error" role="alert" className="text-small font-medium text-[var(--danger-fg)]">{errors.consent}</p>}
      </div>
      <button type="button" onClick={() => setSheet(true)} data-testid="funnel-data-link" className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]">Was wir speichern</button>

      <Button type="submit" size="lg" full loading={busy === "email"} disabled={disabled} data-testid="funnel-create" className="min-h-[52px]">{busy === "email" ? "Einen Moment …" : "Konto erstellen"}</Button>
      {!teacher && <p className="text-center text-small text-muted">7 Tage gratis testen. Ohne Kreditkarte.</p>}
      <DataSheet open={sheet} onClose={() => setSheet(false)} role={state.role} />
    </form>
  );
}

/** Supabase may (depending on its settings) report an existing address. The UI must not differ (SPEC-DATA §3.10). */
function isAlreadyRegistered(error: { message?: string; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("user_already_exists") || text.includes("email_exists");
}

function networkOr(reason: unknown): string {
  const text = String((reason as { message?: string } | null)?.message ?? reason ?? "").toLowerCase();
  if (/failed to fetch|networkerror|load failed|fetch failed/.test(text) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return "Dein Konto konnte nicht erstellt werden. Prüf deine Verbindung und versuch es noch einmal.";
  }
  const status = (reason as { status?: number } | null)?.status;
  if (status === 429 || /rate limit|too many|security purposes/.test(text)) return "Zu viele Versuche. Warte eine Minute und versuch es dann noch einmal.";
  return authErrorMessage(reason);
}
