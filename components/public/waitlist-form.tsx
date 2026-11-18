"use client";

import { useId, useState, type FormEvent } from "react";
import { Mail, Send } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { rateLimitText } from "@/lib/rate-limit-text";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 500;

/**
 * Waitlist / "Zugang anfragen" form. Calls the RPC waitlist_join (anon allowed, the only write path for the
 * waitlist). The Supabase client is loaded lazily on submit so the page renders without env vars or the
 * family migrations; on any error the user gets the mailto fallback. No purchase, no payment.
 */
export function WaitlistForm({ kind, mailFallback }: { kind: string; mailFallback: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [who, setWho] = useState<"Elternteil" | "Jugendliche:r">("Elternteil");
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean) || clean.length > 254) { setEmailError("Bitte eine gültige E-Mail-Adresse eingeben."); return; }
    setEmailError(undefined);
    setState({ kind: "sending" });
    try {
      const { supabase } = await import("@/lib/supabase");
      const text = `[${who}] ${message.trim()}`.slice(0, MAX_MESSAGE);
      const { error } = await supabase.rpc("waitlist_join", { p_email: clean, p_kind: kind, p_message: text });
      if (error) {
        // unique email+kind: already on the list counts as success for the user
        if (error.code === "23505" || /already|bereits|duplicate/i.test(error.message)) { setState({ kind: "done" }); return; }
        throw error;
      }
      setState({ kind: "done" });
    } catch (reason) {
      const limited = rateLimitText(reason);
      if (limited) { setState({ kind: "error", message: limited }); return; }
      setState({ kind: "error", message: "Das hat gerade nicht geklappt. Schreib uns stattdessen eine E-Mail, wir melden uns." });
    }
  }

  if (state.kind === "done") {
    return (
      <div role="status" className="panel-flat p-6">
        <p className="text-heading">Danke, du bist auf der Warteliste.</p>
        <p className="text-body mt-2 text-muted">Wir melden uns per E-Mail, sobald WendApply für Familien verfügbar ist. Wir nutzen deine Adresse nur dafür und geben sie nicht weiter.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="panel space-y-5 p-6 sm:p-7" aria-describedby={`${id}-note`}>
      <fieldset className="min-w-0">
        <legend className="mb-2 block text-sm font-semibold">Ich bin</legend>
        <div className="flex flex-wrap gap-2">
          {(["Elternteil", "Jugendliche:r"] as const).map((w) => (
            <label key={w} className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full [overflow-wrap:anywhere] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] px-4 text-sm font-semibold has-[:checked]:bg-[var(--sun)] has-[:checked]:text-[var(--on-sun)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--brand)]">
              <input type="radio" name={`${id}-who`} value={w} checked={who === w} onChange={() => setWho(w)} className="sr-only" />
              {w}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="E-Mail-Adresse" htmlFor={`${id}-email`} error={emailError}>
        <Input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailError ? true : undefined} placeholder="name@beispiel.ch" />
      </Field>
      <Field label="Nachricht (freiwillig)" htmlFor={`${id}-msg`} hint={`Höchstens ${MAX_MESSAGE} Zeichen. Bitte keine Angaben über dein Kind, die wir nicht brauchen.`}>
        <Textarea id={`${id}-msg`} maxLength={MAX_MESSAGE - 20} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      {state.kind === "error" && (
        <div role="alert" className="rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--warning-line)] bg-[var(--warning-bg)] p-4 text-[15px] text-[var(--warning-fg)]">
          <p>{state.message}</p>
          <ButtonLink href={mailFallback} variant="secondary" size="sm" className="mt-3" icon={<Mail size={16} strokeWidth={2.2} aria-hidden />}>E-Mail schreiben</ButtonLink>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={state.kind === "sending"} icon={<Send size={18} strokeWidth={2.2} aria-hidden />}>Auf die Warteliste</Button>
        <ButtonLink href={mailFallback} variant="ghost" icon={<Mail size={16} strokeWidth={2.2} aria-hidden />}>Lieber per E-Mail</ButtonLink>
      </div>
      <p id={`${id}-note`} className="text-small text-muted">Kein Kauf, keine Zahlung. Wir speichern nur E-Mail, Auswahl und Nachricht, um dich über den Start zu informieren. Du kannst die Löschung jederzeit per E-Mail verlangen.</p>
    </form>
  );
}
