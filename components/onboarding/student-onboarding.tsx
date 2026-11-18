"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Home, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { AuthFrame } from "./auth-frame";
import { TourProgress } from "./tour-progress";
import { CANTONS } from "@/lib/job-filters/geo";
import { addProfession, emptyAnswers, hasAnyAnswer, loadOnboarding, MAX_PROFESSIONS, PROFESSION_SUGGESTIONS, removeProfession, saveOnboarding, SCHOOL_LEVELS, startYearOptions, type OnboardingAnswers } from "@/lib/onboarding";
import {
  checkFirstApplication, completeTour, FIRST_APPLICATION_STATUSES, LAST_STEP, loadTourStatus, needsTour, parseTourParams,
  resumeStep, saveFirstApplication, saveTourStep, tourDoneInMeta, tourExitPath, TOUR_FAMILY_LINK, TOUR_FAMILY_PATH, type FirstApplicationInput,
} from "@/lib/onboarding-tour";
import { clearRoleCache, landingPath, loadMyRole } from "@/lib/role";
import { reward } from "@/lib/rewards";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { friendlyMessage, safeNextPath } from "@/lib/ux";

const linkButton = "inline-flex min-h-11 items-center px-3 text-sm font-medium text-[var(--ink)] underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)] disabled:opacity-60";

/**
 * First-login tour for students (3 steps + done screen, R-8.5b): Wer bist du? → Was möchtest du werden? → Erste Bewerbung
 * (optional) → Fertig. «Überspringen» ends the tour but keeps the answers. `?replay=1` (from the settings) shows the tour
 * again without the gate and returns to the settings. `?next=` survives (invite links).
 */
export function StudentOnboarding() {
  const router = useRouter();
  const [mode, setMode] = useState<{ replay: boolean; next: string | null }>({ replay: false, next: null });
  const [step, setStep] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>(emptyAnswers());
  const [dirty, setDirty] = useState(false);
  const [chip, setChip] = useState("");
  const [app, setApp] = useState<FirstApplicationInput>({ company: "", position: "", status: "saved" });
  const [appInvalid, setAppInvalid] = useState<"company" | "position" | null>(null);
  const [savedApp, setSavedApp] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const leave = (m = mode) => { clearRoleCache(); router.replace(tourExitPath({ ...m, landing: (next) => landingPath("student", next) })); };

  useEffect(() => {
    let alive = true;
    (async () => {
      const params = parseTourParams(window.location.search, safeNextPath);
      setMode(params);
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/login"); return; }
      // Teachers never see the student tour. The DB role wins (metadata can be stale); loadMyRole falls back to metadata.
      const { role } = await loadMyRole(data.user).catch(() => ({ role: data.user.user_metadata?.role === "teacher" ? "teacher" as const : "student" as const }));
      if (!alive) return;
      if (role === "teacher") { router.replace(landingPath("teacher", params.next)); return; }
      let start = 0;
      if (!params.replay) {
        if (tourDoneInMeta(data.user.user_metadata)) { leave(params); return; }
        const status = await loadTourStatus(data.user.id);
        if (!alive) return;
        if (!needsTour("student", data.user.user_metadata, status)) {
          // Done on another device (DB) but the flag is missing: set it so the next login skips the DB read.
          await supabase.auth.updateUser({ data: { onboarding_tour_done: true, student_onboarded: true } }).catch(() => {});
          leave(params); return;
        }
        start = resumeStep(status);
      }
      const existing = await loadOnboarding().catch(() => null);
      if (!alive) return;
      if (existing) { setA(existing.answers); setApp((current) => ({ ...current, position: existing.answers.professions[0] ?? "" })); }
      setStep(start);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps -- leave() only uses router

  // Focus management: every new screen moves focus to its title (announced by screen readers, keyboard starts there).
  useEffect(() => { if (ready) headingRef.current?.focus(); }, [ready, step, savedApp]);

  const patch = (change: Partial<OnboardingAnswers>) => { setDirty(true); setA((current) => ({ ...current, ...change })); };
  const addChip = (value: string) => { patch({ professions: addProfession(a.professions, value) }); setChip(""); };
  const withChip = (): OnboardingAnswers => ({ ...a, professions: chip.trim() ? addProfession(a.professions, chip) : a.professions });

  async function run(action: () => Promise<void>, fallback = "Das hat nicht geklappt. Versuch es noch einmal.") {
    setBusy(true); setError("");
    try { await action(); } catch (reason) { setError(friendlyMessage(reason, fallback)); } finally { setBusy(false); }
  }
  function go(target: number) {
    setError(""); setNameError(""); setAppInvalid(null); setStep(target);
    if (!mode.replay) void saveTourStep(target);
  }
  const back = () => go(step - 1);
  /** "Überspringen": ends the tour, keeps everything typed so far. */
  const skip = () => run(async () => {
    if (step <= 1 && dirty && hasAnyAnswer(withChip())) await saveOnboarding(withChip(), false).catch(() => {});
    if (!mode.replay) await completeTour(step);
    leave();
  });
  const finish = () => run(async () => { if (!mode.replay) await completeTour(LAST_STEP); leave(); });
  /** "Eltern verbinden (freiwillig)": finish the tour like "Fertig", then open /familie. */
  const finishToFamily = () => run(async () => { if (!mode.replay) await completeTour(LAST_STEP); clearRoleCache(); router.replace(TOUR_FAMILY_PATH); });

  /** Step 1 only checks the first name; step 2 saves both steps together (same columns as before). */
  const whoNext = (event: FormEvent) => {
    event.preventDefault();
    if (!a.firstName.trim()) { setNameError("Gib deinen Vornamen ein. Ein Vorname reicht."); document.getElementById("ob-first")?.focus(); return; }
    go(1);
  };
  const goalsNext = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const answers = withChip();
      await saveOnboarding(answers, true);
      setA(answers); setChip(""); setDirty(false); setProfileSaved(true);
      setApp((current) => ({ ...current, position: current.position || answers.professions[0] || "" }));
      go(2);
    }, "Dein Profil konnte nicht gespeichert werden. Du kannst es später unter «Mein Profil» nachtragen.");
  };

  /** Typing into the field that caused the error clears the error message. */
  const editApp = (change: Partial<FirstApplicationInput>) => {
    setApp((current) => ({ ...current, ...change }));
    if (appInvalid && appInvalid in change) { setAppInvalid(null); setError(""); }
  };
  const saveApp = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkFirstApplication(app);
    if (!checked.ok) { setAppInvalid(checked.field); setError(checked.error); document.getElementById(`tour-${checked.field}`)?.focus(); return; }
    void run(async () => {
      await saveFirstApplication(checked.value);
      if (checked.value.status === "applied") reward("applied");
      setSavedApp(checked.value.company);
      setAppInvalid(null);
    }, "Die Bewerbung konnte nicht gespeichert werden. Versuch es noch einmal.");
  };

  if (!ready) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p></main>;

  const title = (content: ReactNode, lead?: ReactNode) => (
    <div className="mb-5">
      <h1 ref={headingRef} tabIndex={-1} className="text-title focus:outline-none">{content}</h1>
      {lead && <p className="mt-2 max-w-md text-body text-muted">{lead}</p>}
    </div>
  );
  /** «Zurück» sits top-left (R-5.x): the bottom only holds the one primary action and one «Überspringen» link. */
  const backLink = step > 0 && <button type="button" onClick={back} disabled={busy} className={cn(linkButton, "-ml-3 -mt-2 gap-1.5 no-underline")}><ArrowLeft size={16} aria-hidden />Zurück</button>;
  const skipLink = (onClick: () => void, label = mode.replay ? "Schliessen" : "Überspringen") => (
    <button type="button" onClick={onClick} disabled={busy} className={cn(linkButton, "mx-auto flex")}>{label}</button>
  );

  return (
    <AuthFrame className="max-w-[560px]">
      <TourProgress step={step} replay={mode.replay} />

      <div className="panel relative p-5 sm:p-7">
        <div key={`${step}-${!!savedApp}`} className="animate-rise space-y-5">
          {error && !appInvalid && <StatusMessage tone="danger">{error}</StatusMessage>}

          {backLink}

          {step === 0 && (
            <form onSubmit={whoNext} className="space-y-5" noValidate>
              {title(<>Wer <span className="marker">bist du</span>?</>, mode.replay ? "Hier siehst du die Einführung nochmals." : "Hoi! In zwei Minuten bist du startklar.")}
              <Field label="Vorname" htmlFor="ob-first" error={nameError}><Input id="ob-first" value={a.firstName} onChange={(e) => { patch({ firstName: e.target.value }); if (nameError && e.target.value.trim()) setNameError(""); }} maxLength={40} autoComplete="given-name" required /></Field>
              <Field label="Nachname (optional)" htmlFor="ob-last" hint="Ein Buchstabe reicht. Deine Lehrperson sieht ihn nur, wenn du einer Klasse beitrittst."><Input id="ob-last" value={a.lastName} onChange={(e) => patch({ lastName: e.target.value })} maxLength={40} autoComplete="family-name" /></Field>
              <Field label="In welcher Klasse / welchem Niveau bist du?" htmlFor="ob-level">
                <Select id="ob-level" value={a.schoolLevel} onChange={(e) => patch({ schoolLevel: e.target.value })}>
                  <option value="">Bitte wählen</option>
                  {SCHOOL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </Select>
              </Field>
              <Button type="submit" full size="lg">Weiter <ArrowRight size={16} /></Button>
              {skipLink(() => void skip())}
            </form>
          )}

          {step === 1 && (
            <form onSubmit={goalsNext} className="space-y-5" noValidate>
              {title(<>Was möchtest du <span className="marker">werden</span>?</>, `Wähle bis zu ${MAX_PROFESSIONS} Wunschberufe. Du kannst alles später ändern.`)}
              <div className="space-y-2">
                <label htmlFor="ob-profession" className="block text-sm font-semibold">Wunschberufe</label>
                <div className="flex gap-2">
                  <Input id="ob-profession" value={chip} onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(chip); } }} placeholder="z. B. Informatiker:in" maxLength={60} />
                  <Button type="button" variant="secondary" onClick={() => addChip(chip)} disabled={!chip.trim()} icon={<Plus size={16} />} aria-label="Beruf hinzufügen" />
                </div>
              </div>
              {a.professions.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Deine Wunschberufe">
                  {a.professions.map((p) => (
                    <li key={p} className="inline-flex min-h-9 items-center gap-1 rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] py-0.5 pl-3.5 pr-1 text-sm font-semibold text-[var(--on-sun)]">
                      {p}
                      <button type="button" onClick={() => patch({ professions: removeProfession(a.professions, p) })} aria-label={`${p} entfernen`} className="flex h-8 w-8 items-center justify-center rounded-full pointer-coarse:h-11 pointer-coarse:w-11"><X size={15} strokeWidth={2.6} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <p className="mb-2 text-small font-semibold">Vorschläge</p>
                <div className="flex flex-wrap gap-2">
                  {PROFESSION_SUGGESTIONS.filter((s) => !a.professions.some((p) => p.toLowerCase() === s.toLowerCase())).map((s) => (
                    <button key={s} type="button" onClick={() => addChip(s)} disabled={a.professions.length >= MAX_PROFESSIONS} className="min-h-9 max-w-full rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] px-3.5 py-1 text-sm font-medium hyphens-auto [overflow-wrap:anywhere] transition-colors hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-50 pointer-coarse:min-h-11">+ {s}</button>
                  ))}
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Wohnort" htmlFor="ob-place"><Input id="ob-place" value={a.place} onChange={(e) => patch({ place: e.target.value })} maxLength={80} autoComplete="address-level2" placeholder="z. B. Winterthur" /></Field>
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
              <Button type="submit" full size="lg" loading={busy}>Weiter <ArrowRight size={16} /></Button>
              {skipLink(() => void skip())}
            </form>
          )}

          {step === 2 && !savedApp && (
            <form onSubmit={saveApp} className="space-y-5" noValidate>
              {title(<>Deine erste <span className="marker">Bewerbung</span></>, "Hast du schon eine Firma im Kopf? Trag sie ein. Details ergänzt du später.")}
              <Field label="Firma" htmlFor="tour-company" error={appInvalid === "company" ? error : undefined}><Input id="tour-company" value={app.company} onChange={(e) => editApp({ company: e.target.value })} maxLength={120} autoComplete="organization" placeholder="z. B. Migros" /></Field>
              <Field label="Beruf / Stelle" htmlFor="tour-position" error={appInvalid === "position" ? error : undefined}><Input id="tour-position" value={app.position} onChange={(e) => editApp({ position: e.target.value })} maxLength={120} placeholder="z. B. Detailhandelsfachfrau / -mann" list="tour-professions" /></Field>
              <datalist id="tour-professions">{[...new Set([...a.professions, ...PROFESSION_SUGGESTIONS])].map((p) => <option key={p} value={p} />)}</datalist>
              <fieldset className="min-w-0 border-0 p-0">
                <legend className="mb-2 text-sm font-semibold">Status</legend>
                <div className="grid gap-2 min-[420px]:grid-cols-3">
                  {FIRST_APPLICATION_STATUSES.map((s) => (
                    <label key={s.value} className={cn("flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border-[length:var(--border-w)] px-3 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--brand)]",
                      app.status === s.value ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]" : "border-[var(--outline)] bg-[var(--surface)]")}>
                      <input type="radio" name="tour-status" value={s.value} checked={app.status === s.value} onChange={() => setApp({ ...app, status: s.value })} className="sr-only" />
                      <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] border-current")}>{app.status === s.value && <Check size={12} strokeWidth={3.4} />}</span>
                      <span className="min-w-0 leading-tight"><span className="block text-sm font-bold">{s.label}</span><span className="block text-[13px]">{s.hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" full size="lg" loading={busy}>Bewerbung speichern</Button>
              {skipLink(() => go(3), mode.replay ? "Weiter" : "Überspringen")}
            </form>
          )}

          {step === 2 && savedApp && (
            <div className="space-y-5">
              <span className="sticker sticker-mint animate-sticker"><Check size={14} strokeWidth={3} aria-hidden />Bewerbung gespeichert</span>
              {title(<><span className="marker">{savedApp}</span> ist drin</>, "In deinem Dorf steht jetzt dein erstes Haus. Alle Bewerbungen findest du unter «Bewerbungen».")}
              <Button type="button" full size="lg" onClick={() => go(3)}>Weiter <ArrowRight size={16} /></Button>
            </div>
          )}

          {step === 3 && (
            <>
              <span className="sticker sticker-mint animate-sticker"><Check size={14} strokeWidth={3} aria-hidden />Startklar</span>
              {title(<>Du bist <span className="marker">bereit</span></>, "Ein guter nächster Schritt reicht für heute.")}
              <ul className="rows" aria-label="Das hast du erledigt">
                <DoneRow done={profileSaved || !!a.firstName}>Profil & Ziele</DoneRow>
                <DoneRow done={!!savedApp}>Erste Bewerbung</DoneRow>
              </ul>
              <div className="inset flex items-start gap-3 p-4">
                <Home aria-hidden size={22} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[var(--coral)]" />
                <p className="text-small"><strong>Dein Dorf wächst.</strong> Jede Bewerbung baut ein Haus. Mit Punkten kaufst du Bäume und mehr.</p>
              </div>
              <Button type="button" full size="lg" loading={busy} onClick={() => void finish()}>{mode.replay ? "Zurück zu den Einstellungen" : "Fertig"}</Button>
              {!mode.replay && <button type="button" onClick={() => void finishToFamily()} disabled={busy} data-testid="tour-family-link" className={cn(linkButton, "mx-auto flex")}>{TOUR_FAMILY_LINK}</button>}
            </>
          )}
        </div>
      </div>
    </AuthFrame>
  );
}

function DoneRow({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center gap-3 py-2">
      <span aria-hidden className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)]", done ? "border-[var(--outline-fill)] bg-[var(--mint)] text-[var(--on-mint)]" : "border-dashed border-[var(--outline)] text-muted")}>
        {done ? <Check size={13} strokeWidth={3} /> : null}
      </span>
      <span className={cn("text-body", !done && "text-muted")}>{children}</span>
      <span className="sr-only">{done ? "erledigt" : "noch offen"}</span>
    </li>
  );
}
