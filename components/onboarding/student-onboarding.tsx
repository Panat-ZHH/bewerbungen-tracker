"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Coins, ListChecks, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { DoodleSparkle, DoodleUnderline } from "@/components/ui/doodles";
import { AuthFrame } from "./auth-frame";
import { TourProgress } from "./tour-progress";
import { CANTONS } from "@/lib/job-filters/geo";
import { addProfession, emptyAnswers, hasAnyAnswer, loadOnboarding, MAX_PROFESSIONS, PROFESSION_SUGGESTIONS, removeProfession, saveOnboarding, SCHOOL_LEVELS, startYearOptions, type OnboardingAnswers } from "@/lib/onboarding";
import {
  checkFirstApplication, completeTour, FIRST_APPLICATION_STATUSES, LAST_STEP, loadTourStatus, needsTour, parseTourParams, PROFILE_PARTS,
  resumeStep, saveFirstApplication, saveTourStep, tourDoneInMeta, tourExitPath, type FirstApplicationInput,
} from "@/lib/onboarding-tour";
import { clearRoleCache, landingPath } from "@/lib/role";
import { reward } from "@/lib/rewards";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { friendlyMessage, safeNextPath } from "@/lib/ux";

const linkButton = "inline-flex min-h-11 items-center px-3 text-sm font-medium text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)] disabled:opacity-60";

const WELCOME_CARDS: { icon: ReactNode; title: string; text: string; tone: string }[] = [
  { icon: <Search size={26} strokeWidth={2.2} />, title: "Lehrstellen finden", text: "Suche freie Lehrstellen in deiner Nähe und merke dir die besten.", tone: "text-[var(--brand)]" },
  { icon: <ListChecks size={26} strokeWidth={2.2} />, title: "Bewerbungen im Blick", text: "Du siehst immer, was abgeschickt ist und was noch fehlt. Der KI-Check hilft beim Schreiben.", tone: "text-[var(--ink)]" },
  { icon: <Coins size={26} strokeWidth={2.2} />, title: "Deine Insel wächst", text: "Jede Bewerbung baut ein Haus. Mit Münzen kaufst du Bäume und mehr.", tone: "text-[var(--coral)]" },
];

/**
 * First-login tour for students (5 steps): Willkommen → Profil & Ziele → Erste Bewerbung → KI-Check → Fertig.
 * Every step can be skipped; skipping ends the tour but keeps the answers. `?replay=1` (from the settings) shows the tour
 * again without the gate and returns to the settings. `?next=` survives (invite links).
 */
export function StudentOnboarding() {
  const router = useRouter();
  const [mode, setMode] = useState<{ replay: boolean; next: string | null }>({ replay: false, next: null });
  const [step, setStep] = useState(0);
  const [part, setPart] = useState(0);
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
      if (data.user.user_metadata?.role === "teacher") { router.replace("/teacher"); return; }
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
  useEffect(() => { if (ready) headingRef.current?.focus(); }, [ready, step, part]);

  const patch = (change: Partial<OnboardingAnswers>) => { setDirty(true); setA((current) => ({ ...current, ...change })); };
  const addChip = (value: string) => { patch({ professions: addProfession(a.professions, value) }); setChip(""); };
  const withChip = (): OnboardingAnswers => ({ ...a, professions: chip.trim() ? addProfession(a.professions, chip) : a.professions });

  async function run(action: () => Promise<void>, fallback = "Das hat nicht geklappt. Versuch es nochmals.") {
    setBusy(true); setError("");
    try { await action(); } catch (reason) { setError(friendlyMessage(reason, fallback)); } finally { setBusy(false); }
  }
  function go(target: number, targetPart = 0) {
    setError(""); setAppInvalid(null); setStep(target); setPart(targetPart);
    if (!mode.replay) void saveTourStep(target);
  }
  function back() {
    if (step === 1 && part > 0) { setError(""); setPart(part - 1); return; }
    go(step - 1, step === 2 ? PROFILE_PARTS - 1 : 0);
  }
  /** "Überspringen": ends the tour, keeps everything typed so far. */
  const skip = () => run(async () => {
    if (step === 1 && dirty && hasAnyAnswer(withChip())) await saveOnboarding(withChip(), false).catch(() => {});
    if (!mode.replay) await completeTour(step);
    leave();
  });
  const finish = () => run(async () => { if (!mode.replay) await completeTour(LAST_STEP); leave(); });

  const profileNext = (event: FormEvent) => {
    event.preventDefault();
    if (part === 0 && !a.firstName.trim()) { setError("Wie dürfen wir dich nennen? Ein Vorname reicht."); return; }
    if (part < PROFILE_PARTS - 1) { setError(""); setPart(part + 1); return; }
    void run(async () => {
      const answers = withChip();
      await saveOnboarding(answers, true);
      setA(answers); setChip(""); setDirty(false); setProfileSaved(true);
      setApp((current) => ({ ...current, position: current.position || answers.professions[0] || "" }));
      go(2);
    }, "Dein Profil konnte nicht gespeichert werden. Du kannst es später im Profil nachtragen.");
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
    }, "Die Bewerbung konnte nicht gespeichert werden.");
  };

  const openCheck = () => run(async () => { if (!mode.replay) await completeTour(3); clearRoleCache(); router.push("/bewerbung-check"); });

  if (!ready) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5"><p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p></main>;

  const title = (content: ReactNode, lead?: ReactNode) => (
    <div className="mb-5">
      <h1 ref={headingRef} tabIndex={-1} className="text-title focus:outline-none">{content}</h1>
      {lead && <p className="mt-2 max-w-md text-body text-muted">{lead}</p>}
    </div>
  );
  const nav = (primary: ReactNode, showBack = true) => (
    <div className="flex flex-col-reverse gap-3 min-[420px]:flex-row min-[420px]:items-center">
      {showBack && <Button type="button" variant="ghost" onClick={back} disabled={busy} icon={<ArrowLeft size={16} />}>Zurück</Button>}
      <div className="min-[420px]:ml-auto min-[420px]:min-w-48">{primary}</div>
    </div>
  );

  return (
    <AuthFrame className="max-w-[560px]">
      <TourProgress step={step} replay={mode.replay} />

      <div className="panel relative p-5 sm:p-7">
        <DoodleSparkle className="absolute -right-3 -top-4 h-9 w-9 text-[var(--sun)]" />
        <div key={`${step}-${part}`} className="animate-rise space-y-5">
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}

          {step === 0 && (
            <>
              {title(<>Hoi! Das ist <span className="marker">WendApply</span></>, mode.replay ? "Hier nochmals kurz, was du alles machen kannst." : "Schön, dass du da bist. In zwei Minuten bist du startklar.")}
              <ol className="space-y-3" aria-label="Was WendApply kann">
                {WELCOME_CARDS.map((card, i) => (
                  <li key={card.title} className={cn("inset flex items-start gap-4 p-4", i === 1 && "sm:ml-4", i === 2 && "sm:ml-8")}>
                    <span aria-hidden className={cn("mt-0.5 shrink-0", card.tone)}>{card.icon}</span>
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-extrabold leading-tight">{card.title}</h2>
                      <p className="mt-1 text-small text-muted">{card.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {nav(<Button type="button" full size="lg" onClick={() => go(1)}>Los geht’s <ArrowRight size={16} /></Button>, false)}
            </>
          )}

          {step === 1 && (
            <form onSubmit={profileNext} className="space-y-5" noValidate>
              {part === 0 && (
                <>
                  {title(<>Wer <span className="marker">bist du</span>?</>, `Teil 1 von ${PROFILE_PARTS}. So können wir dich begrüssen.`)}
                  <Field label="Vorname" htmlFor="ob-first"><Input id="ob-first" value={a.firstName} onChange={(e) => patch({ firstName: e.target.value })} maxLength={40} autoComplete="given-name" required aria-invalid={!!error && !a.firstName.trim()} /></Field>
                  <Field label="Nachname (oder nur der erste Buchstabe)" htmlFor="ob-last" hint="Optional. Deine Lehrperson sieht diesen Namen nur, wenn du einer Klasse beitrittst."><Input id="ob-last" value={a.lastName} onChange={(e) => patch({ lastName: e.target.value })} maxLength={40} autoComplete="family-name" /></Field>
                  <Field label="In welcher Klasse / welchem Niveau bist du?" htmlFor="ob-level">
                    <Select id="ob-level" value={a.schoolLevel} onChange={(e) => patch({ schoolLevel: e.target.value })}>
                      <option value="">Bitte wählen</option>
                      {SCHOOL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </Select>
                  </Field>
                </>
              )}
              {part === 1 && (
                <>
                  {title(<>Was möchtest du <span className="marker">werden</span>?</>, `Teil 2 von ${PROFILE_PARTS}. Tippe Wunschberufe ein oder wähle Vorschläge. Bis ${MAX_PROFESSIONS} sind möglich.`)}
                  <div className="flex gap-2">
                    <Input aria-label="Wunschberuf eingeben" value={chip} onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(chip); } }} placeholder="z. B. Informatiker:in" maxLength={60} />
                    <Button type="button" variant="secondary" onClick={() => addChip(chip)} disabled={!chip.trim()} icon={<Plus size={16} />} aria-label="Hinzufügen" />
                  </div>
                  {a.professions.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="Deine Wunschberufe">
                      {a.professions.map((p) => (
                        <li key={p} className="inline-flex min-h-9 items-center gap-1 rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] py-0.5 pl-3.5 pr-1 text-sm font-semibold text-[var(--on-sun)] shadow-[var(--shadow-xs)]">
                          {p}
                          <button type="button" onClick={() => patch({ professions: removeProfession(a.professions, p) })} aria-label={`${p} entfernen`} className="flex h-8 w-8 items-center justify-center rounded-full pointer-coarse:h-10 pointer-coarse:w-10"><X size={15} strokeWidth={2.6} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div>
                    <p className="mb-2 text-small font-semibold text-muted">Vorschläge</p>
                    <div className="flex flex-wrap gap-2">
                      {PROFESSION_SUGGESTIONS.filter((s) => !a.professions.some((p) => p.toLowerCase() === s.toLowerCase())).map((s) => (
                        <button key={s} type="button" onClick={() => addChip(s)} disabled={a.professions.length >= MAX_PROFESSIONS} className="min-h-9 rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] px-3.5 text-sm font-medium transition-colors hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-50 pointer-coarse:min-h-11">+ {s}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {part === 2 && (
                <>
                  {title(<>Wo und <span className="marker">ab wann</span>?</>, `Teil 3 von ${PROFILE_PARTS}. Damit suchen wir in deiner Nähe. Du kannst alles später ändern.`)}
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
                </>
              )}
              {nav(<Button type="submit" full size="lg" loading={busy}>{part < PROFILE_PARTS - 1 ? "Weiter" : "Speichern & weiter"} <ArrowRight size={16} /></Button>)}
            </form>
          )}

          {step === 2 && !savedApp && (
            <form onSubmit={saveApp} className="space-y-5" noValidate>
              {title(<>Deine erste <span className="marker">Bewerbung</span></>, "Hast du schon eine Firma im Kopf? Trag sie ein. Mehr Details kannst du später ergänzen.")}
              <Field label="Firma" htmlFor="tour-company"><Input id="tour-company" value={app.company} onChange={(e) => setApp({ ...app, company: e.target.value })} maxLength={120} autoComplete="organization" placeholder="z. B. Migros" aria-invalid={appInvalid === "company" || undefined} /></Field>
              <Field label="Beruf" htmlFor="tour-position"><Input id="tour-position" value={app.position} onChange={(e) => setApp({ ...app, position: e.target.value })} maxLength={120} placeholder="z. B. Detailhandelsfachfrau / -mann" list="tour-professions" aria-invalid={appInvalid === "position" || undefined} /></Field>
              <datalist id="tour-professions">{[...a.professions, ...PROFESSION_SUGGESTIONS].map((p) => <option key={p} value={p} />)}</datalist>
              <fieldset className="min-w-0 border-0 p-0">
                <legend className="mb-2 text-sm font-semibold">Wie weit bist du?</legend>
                <div className="grid gap-2 min-[420px]:grid-cols-3">
                  {FIRST_APPLICATION_STATUSES.map((s) => (
                    <label key={s.value} className={cn("flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border-[length:var(--border-w)] px-3 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--brand)]",
                      app.status === s.value ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--outline)] bg-[var(--surface)]")}>
                      <input type="radio" name="tour-status" value={s.value} checked={app.status === s.value} onChange={() => setApp({ ...app, status: s.value })} className="sr-only" />
                      <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] border-current")}>{app.status === s.value && <Check size={12} strokeWidth={3.4} />}</span>
                      <span className="min-w-0 leading-tight"><span className="block text-sm font-bold">{s.label}</span><span className={cn("block text-[13px]", app.status === s.value ? "" : "text-muted")}>{s.hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {nav(<Button type="submit" full size="lg" loading={busy}>Bewerbung speichern</Button>)}
              <button type="button" onClick={() => go(3)} disabled={busy} className={cn(linkButton, "mx-auto flex")}>Mache ich später</button>
            </form>
          )}

          {step === 2 && savedApp && (
            <div className="space-y-5">
              <span className="sticker sticker-mint animate-sticker"><Check size={14} strokeWidth={3} aria-hidden />Gespeichert</span>
              {title(<>Super, <span className="marker">{savedApp}</span> ist drin!</>, "Auf deiner Insel steht jetzt dein erstes Haus. Alle Bewerbungen findest du unter «Bewerbungen».")}
              {nav(<Button type="button" full size="lg" onClick={() => go(3)}>Weiter <ArrowRight size={16} /></Button>)}
            </div>
          )}

          {step === 3 && (
            <>
              {title(<>Probier den <span className="marker">KI-Check</span></>, null)}
              <div className="inset flex items-start gap-4 p-4">
                <Sparkles aria-hidden size={26} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                <p className="text-body">Lade dein Bewerbungsschreiben hoch. Die KI gibt dir in einer Minute konkrete Tipps, was du besser machen kannst.</p>
              </div>
              <Button type="button" variant="sun" full size="lg" loading={busy} onClick={() => void openCheck()} icon={<Sparkles size={17} />}>Bewerbung prüfen lassen</Button>
              {nav(<Button type="button" variant="secondary" full onClick={() => go(4)} disabled={busy}>Später <ArrowRight size={16} /></Button>)}
            </>
          )}

          {step === 4 && (
            <>
              <span className="sticker sticker-mint animate-sticker"><Check size={14} strokeWidth={3} aria-hidden />Startklar</span>
              {title(<>Du bist <span className="marker">bereit</span>!</>, "Ein guter nächster Schritt reicht für heute.")}
              <ul className="rows" aria-label="Das hast du erledigt">
                <DoneRow done={profileSaved || !!a.firstName}>Profil & Ziele</DoneRow>
                <DoneRow done={!!savedApp}>Erste Bewerbung</DoneRow>
              </ul>
              <p className="text-small text-muted">Den KI-Check findest du jederzeit unter «Dokumente».</p>
              <DoodleUnderline className="h-3 w-28 text-[var(--sun)]" />
              {nav(<Button type="button" variant="sun" full size="lg" loading={busy} onClick={() => void finish()}>{mode.replay ? "Zurück zu den Einstellungen" : mode.next ? "Weiter" : "Zum Dashboard"} <ArrowRight size={16} strokeWidth={2.4} /></Button>)}
            </>
          )}

          {step < LAST_STEP && (
            <button type="button" onClick={() => void skip()} disabled={busy} className={cn(linkButton, "mx-auto flex")}>
              {mode.replay ? "Einführung schliessen" : "Einführung überspringen"}
            </button>
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
