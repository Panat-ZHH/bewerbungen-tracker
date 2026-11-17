"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { AuthFrame, AuthTitle } from "./auth-frame";
import { supabase } from "@/lib/supabase";
import { studentOnboardingHref } from "@/lib/role";
import { safeNextPath } from "@/lib/ux";

/** Normalises a typed class code (letters + digits, upper case). */
export function normalizeClassCode(input: string): string { return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16); }

/**
 * "Schule" signup, before the tour (G8): asks once for the class code. With a code the student joins the class (a licensed
 * school then pays, no trial / prices); "Ich habe noch keinen Code" continues to the tour. Asked once (class_code_asked).
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
    if (clean.length < 4) { setError("Bitte gib den Klassencode von deiner Lehrperson ein."); return; }
    setBusy(true); setError("");
    await remember();
    router.replace(`/classes/join/${encodeURIComponent(clean)}`);
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
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}
          <Field label="Klassencode" htmlFor="class-code">
            <Input id="class-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" inputMode="text" placeholder="z. B. KLAS7Q2" maxLength={20} />
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
