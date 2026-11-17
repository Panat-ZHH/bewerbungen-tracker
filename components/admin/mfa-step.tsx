"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";

type State =
  | { kind: "loading" }
  | { kind: "verify"; factorId: string }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "error"; message: string };

const FRIENDLY_NAME = "WendApply Admin";

/** TOTP step: verify an existing authenticator factor, or enrol a new one (QR + secret) and verify it. */
export function MfaStep({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const prepare = useCallback(async () => {
    setState({ kind: "loading" });
    setError(null);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const totp = (data?.all ?? []).filter((f) => f.factor_type === "totp");
      const verified = totp.find((f) => f.status === "verified");
      if (verified) { setState({ kind: "verify", factorId: verified.id }); return; }
      // Leftovers of an aborted enrolment block a new one with the same name: remove them first.
      for (const f of totp.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: FRIENDLY_NAME });
      if (enrollError || !enrolled) throw enrollError ?? new Error("enroll");
      setState({ kind: "enroll", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    } catch {
      setState({ kind: "error", message: "Die Zwei-Faktor-Anmeldung konnte nicht vorbereitet werden. Lade die Seite neu oder melde dich nochmals an." });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void prepare();
  }, [prepare]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state.kind !== "verify" && state.kind !== "enroll") return;
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) { setError("Bitte gib die 6 Ziffern aus deiner Authenticator-App ein."); return; }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: clean });
      if (verifyError) {
        const msg = (verifyError.message || "").toLowerCase();
        setError(msg.includes("expired") ? "Der Code ist abgelaufen. Nimm den aktuellen Code." : msg.includes("rate") || verifyError.status === 429
          ? "Zu viele Versuche. Bitte warte kurz."
          : "Der Code stimmt nicht. Nimm den aktuellen Code aus deiner App.");
        setCode("");
        return;
      }
      onDone();
    } catch {
      setError("Keine Verbindung. Versuch es nochmals.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto mt-2 max-w-md" data-testid="admin-mfa">
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={28} strokeWidth={2.2} className="mt-1 shrink-0 text-[var(--brand)]" aria-hidden />
          <div>
            <h1 className="text-title">Zweiter Schritt</h1>
            <p className="mt-1 text-body text-muted">
              {state.kind === "enroll"
                ? "Scanne den QR-Code mit deiner Authenticator-App und gib danach den Code ein."
                : "Gib den 6-stelligen Code aus deiner Authenticator-App ein."}
            </p>
          </div>
        </div>

        {state.kind === "loading" && <div aria-busy="true" className="space-y-3"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-32" /></div>}

        {state.kind === "error" && (
          <div className="space-y-3">
            <StatusMessage tone="danger">{state.message}</StatusMessage>
            <Button variant="secondary" onClick={() => void prepare()}>Nochmals versuchen</Button>
          </div>
        )}

        {state.kind === "enroll" && (
          <div className="space-y-3">
            {/* SVG data URL from Supabase; a plain img is enough (no optimisation needed, CSP allows data:). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.qr} alt="QR-Code für deine Authenticator-App" width={180} height={180} data-testid="admin-mfa-qr" className="rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--outline)] bg-white p-2" />
            <div className="inset px-3 py-2.5">
              <p className="text-small text-muted">Kein Scan möglich? Gib diesen Schlüssel von Hand ein:</p>
              <code className="mt-1 block break-all font-mono text-sm font-semibold select-all">{state.secret}</code>
            </div>
          </div>
        )}

        {(state.kind === "verify" || state.kind === "enroll") && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Code" htmlFor="admin-mfa-code" error={error ?? undefined}>
              <Input
                id="admin-mfa-code"
                data-testid="admin-mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={7}
                autoFocus
                value={code}
                aria-invalid={error ? true : undefined}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
                className="max-w-48 tabular tracking-[0.3em]"
              />
            </Field>
            <Button type="submit" loading={busy} data-testid="admin-mfa-submit">Bestätigen</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
