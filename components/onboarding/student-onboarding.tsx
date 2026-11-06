"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { CANTONS } from "@/lib/job-filters/geo";
import { addProfession, emptyAnswers, loadOnboarding, MAX_PROFESSIONS, PROFESSION_SUGGESTIONS, removeProfession, saveOnboarding, SCHOOL_LEVELS, skipOnboarding, startYearOptions, type OnboardingAnswers } from "@/lib/onboarding";
import { clearRoleCache, landingPath } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { friendlyMessage, safeNextPath } from "@/lib/ux";

const STEPS = ["Du", "Wunschberufe", "Wo & wann"];

/** First login of a student: 3 short screens. Every screen and the whole flow can be skipped ("Später"). */
export function StudentOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>(emptyAnswers());
  const [chip, setChip] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const target = () => landingPath("student", safeNextPath(new URLSearchParams(window.location.search).get("next")));
  const leave = () => { clearRoleCache(); router.replace(target()); };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      if (data.user.user_metadata?.role === "teacher") { router.replace("/teacher"); return; }
      if (data.user.user_metadata?.student_onboarded === true) { if (alive) leave(); return; }
      const existing = await loadOnboarding().catch(() => null);
      if (!alive) return;
      if (existing?.completed) { await supabase.auth.updateUser({ data: { student_onboarded: true } }).catch(() => {}); leave(); return; }
      if (existing) setA(existing.answers);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps -- leave() only uses router

  const patch = (change: Partial<OnboardingAnswers>) => setA((current) => ({ ...current, ...change }));
  const addChip = (value: string) => { patch({ professions: addProfession(a.professions, value) }); setChip(""); };

  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (reason) { setError(friendlyMessage(reason, "Das hat nicht geklappt. Du kannst es später im Profil nachtragen.")); } finally { setBusy(false); } }
  const skipAll = () => run(async () => { await skipOnboarding(); leave(); });
  const next1 = (event: FormEvent) => { event.preventDefault(); if (!a.firstName.trim()) { setError("Wie dürfen wir dich nennen? Ein Vorname reicht."); return; } setError(""); setStep(1); };
  const next2 = (event: FormEvent) => { event.preventDefault(); setError(""); setStep(2); };
  const finish = (event: FormEvent) => { event.preventDefault(); void run(async () => { await saveOnboarding({ ...a, professions: chip.trim() ? addProfession(a.professions, chip) : a.professions }, true); leave(); }); };

  if (!ready) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p className="text-sm text-muted">Einen Moment …</p></main>;

  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="animate-rise w-full max-w-[520px]">
        <Image src="/logo.png" alt="WendApply" width={56} height={56} className="logo-tile mx-auto rounded-[16px] bg-[#f2f7ff] p-1 shadow-[var(--shadow-md)]" priority />
        <ol className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2" aria-label="Fortschritt">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
              <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${i <= step ? "bg-[var(--brand)] text-white" : "bg-[var(--neutral-bg)] text-muted"}`}>{i < step ? <Check size={13} /> : i + 1}</span>
              <span className={`text-small hidden sm:inline ${i === step ? "font-semibold" : "text-muted"}`}>{label}</span>
              {i < STEPS.length - 1 && <span aria-hidden className="h-px w-5 bg-[var(--line)]" />}
            </li>
          ))}
        </ol>

        <div className="glass-surface mt-5 space-y-5 p-5 sm:p-7">
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}

          {step === 0 && (
            <form onSubmit={next1} className="space-y-5">
              <div className="text-center"><h1 className="text-title">Schön, dass du da bist!</h1><p className="mt-2 text-sm text-muted">Drei kurze Fragen, dann zeigen wir dir passende Lehrstellen.</p></div>
              <Field label="Vorname" htmlFor="ob-first"><Input id="ob-first" value={a.firstName} onChange={(e) => patch({ firstName: e.target.value })} maxLength={40} autoComplete="given-name" data-autofocus /></Field>
              <Field label="Nachname (oder nur der erste Buchstabe)" htmlFor="ob-last" hint="Optional. Deine Lehrperson sieht diesen Namen nur, wenn du einer Klasse beitrittst."><Input id="ob-last" value={a.lastName} onChange={(e) => patch({ lastName: e.target.value })} maxLength={40} autoComplete="family-name" /></Field>
              <Field label="In welcher Klasse / welchem Niveau bist du?" htmlFor="ob-level">
                <Select id="ob-level" value={a.schoolLevel} onChange={(e) => patch({ schoolLevel: e.target.value })}>
                  <option value="">Bitte wählen</option>
                  {SCHOOL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </Select>
              </Field>
              <Button type="submit" full size="lg">Weiter <ArrowRight size={16} /></Button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={next2} className="space-y-5">
              <div className="text-center"><h1 className="text-title">Was möchtest du werden?</h1><p className="mt-2 text-sm text-muted">Tippe deine Wunschberufe ein oder wähle Vorschläge. Es dürfen mehrere sein (bis {MAX_PROFESSIONS}).</p></div>
              <div className="flex gap-2">
                <Input aria-label="Wunschberuf eingeben" value={chip} onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(chip); } }} placeholder="z. B. Informatiker:in" maxLength={60} data-autofocus />
                <Button type="button" variant="secondary" onClick={() => addChip(chip)} disabled={!chip.trim()} icon={<Plus size={16} />} aria-label="Hinzufügen" />
              </div>
              {a.professions.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Deine Wunschberufe">
                  {a.professions.map((p) => (
                    <li key={p} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-[var(--brand-soft)] py-1 pl-3.5 pr-1.5 text-sm font-medium text-[var(--brand-strong)]">
                      {p}
                      <button type="button" onClick={() => patch({ professions: removeProfession(a.professions, p) })} aria-label={`${p} entfernen`} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--hover)]"><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <p className="mb-2 text-small text-muted">Vorschläge</p>
                <div className="flex flex-wrap gap-2">
                  {PROFESSION_SUGGESTIONS.filter((s) => !a.professions.some((p) => p.toLowerCase() === s.toLowerCase())).map((s) => (
                    <button key={s} type="button" onClick={() => addChip(s)} disabled={a.professions.length >= MAX_PROFESSIONS} className="min-h-9 rounded-full border border-[var(--field-border)] bg-[var(--field-bg)] px-3.5 text-sm transition hover:border-[var(--brand)] active:scale-[.97] disabled:opacity-50">+ {s}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(0)}>Zurück</Button>
                <Button type="submit" full size="lg">Weiter <ArrowRight size={16} /></Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={finish} className="space-y-5">
              <div className="text-center"><h1 className="text-title">Wo und ab wann?</h1><p className="mt-2 text-sm text-muted">Damit suchen wir in deiner Nähe. Alles kannst du später ändern.</p></div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Wohnort" htmlFor="ob-place"><Input id="ob-place" value={a.place} onChange={(e) => patch({ place: e.target.value })} maxLength={80} autoComplete="address-level2" placeholder="z. B. Winterthur" data-autofocus /></Field>
                <Field label="Kanton" htmlFor="ob-canton">
                  <Select id="ob-canton" value={a.canton} onChange={(e) => patch({ canton: e.target.value })}>
                    <option value="">Bitte wählen</option>
                    {CANTONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Gewünschter Lehrbeginn" htmlFor="ob-start">
                <Select id="ob-start" value={a.startYear ? String(a.startYear) : ""} onChange={(e) => patch({ startYear: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Weiss ich noch nicht</option>
                  {startYearOptions().map((y) => <option key={y} value={y}>Sommer {y}</option>)}
                </Select>
              </Field>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>Zurück</Button>
                <Button type="submit" full size="lg" loading={busy}>Los geht’s <ArrowRight size={16} /></Button>
              </div>
            </form>
          )}

          <button type="button" onClick={() => void skipAll()} disabled={busy} className="mx-auto flex min-h-11 items-center px-3 text-sm font-medium text-muted hover:underline disabled:opacity-60">Später</button>
        </div>
      </div>
    </main>
  );
}
