"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthFrame, AuthTitle } from "./auth-frame";
import { classErrorCode, previewClass } from "@/lib/classes";
import { supabase } from "@/lib/supabase";
import { STUDENT_ONBOARDING_PATH, studentOnboardingHref } from "@/lib/role";
import { safeNextPath } from "@/lib/ux";

/** Field error for a class code lookup that failed (glossary 4.3). */
export function classCodeError(reason: unknown): string {
  const code = classErrorCode(reason);
  if (code === "CLASS_NOT_FOUND" || code === "NOT_FOUND" || code === "INVALID" || code === "INVALID_REQUEST") return "Diesen Klassencode gibt es nicht. Prüfe ihn oder frag deine Lehrperson nach einem neuen.";
  if (code === "RATE_LIMITED") return "Zu viele Versuche. Warte einen Moment und versuch es dann noch einmal.";
  return "Der Klassencode konnte nicht geprüft werden. Prüfe deine Verbindung und versuch es noch einmal.";
}

/** Normalises a typed class code (letters + digits, upper case). */
export function normalizeClassCode(input: string): string { return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16); }

/**
 * "Schule" signup, before the tour (G8): asks once for the class code. The code is checked here (schueler-02): a wrong code
 * shows an error under the field and the pupil stays in the flow. A valid code opens the join page with ?next=/onboarding,
 * so the tour follows after joining. "Ich habe noch keinen Code" continues to the tour. Asked once (class_code_asked).
 */
export function ClassCodeStep() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const next = () => safeNextPath(new URLSearchParams(window.location.search).get("next"));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login"); else setReady(true); });
  }, [router]);

  async function remember() { await supabase.auth.updateUser({ data: { class_code_asked: true } }).catch(() => {}); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = normalizeClassCode(code);
    if (clean.length < 4) { setError("Gib den Klassencode deiner Lehrperson ein."); document.getElementById("class-code")?.focus(); return; }
    setBusy(true); setError("");
    try { await previewClass(clean); } catch (reason) { setError(classCodeError(reason)); setBusy(false); document.getElementById("class-code")?.focus(); return; }
    await remember();
    // After joining, the join page continues to the tour (which itself keeps an outer ?next=).
    const after = next() ? studentOnboardingHref(next()) : STUDENT_ONBOARDING_PATH;
    router.replace(`/classes/join/${encodeURIComponent(clean)}?next=${encodeURIComponent(after)}`);
  }

  async function skip() {
    setBusy(true);
    await remember();
    router.replace(studentOnboardingHref(next()));
  }

  return (
    <AuthFrame className="max-w-[520px]">
      {!ready ? <p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p> : (
        <form onSubmit={submit} className="space-y-6" data-testid="class-code-step">
          <AuthTitle title={<>Hast du einen <span className="marker">Klassencode</span>?</>}>
            Deine Lehrperson gibt dir den Code. Hat deine Schule eine Lizenz, nutzt du WendApply damit über die Schule.
          </AuthTitle>
          <Field label="Klassencode" htmlFor="class-code" error={error || undefined}>
            <Input id="class-code" value={code} onChange={(e) => { setCode(e.target.value); if (error) setError(""); }} autoComplete="off" autoCapitalize="characters" inputMode="text" placeholder="z. B. KLAS7Q2" maxLength={20} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" loading={busy} icon={<School size={16} aria-hidden />}>Klasse beitreten</Button>
            <button type="button" onClick={() => void skip()} disabled={busy} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)] disabled:opacity-60">Ich habe noch keinen Code<ArrowRight size={14} aria-hidden /></button>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}
