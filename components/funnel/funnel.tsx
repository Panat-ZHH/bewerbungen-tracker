"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { resolveLanding, hasExplicitRole } from "@/lib/role";
import { safeNextPath } from "@/lib/ux";
import { funnelNextPath } from "@/lib/funnel/next";
import type { FunnelStateV1 } from "@/lib/funnel/types";
import { cn } from "@/lib/utils";
import {
  canResume, emptyFunnelState, isSkippable, loginHref, neighbours, presetFromNext, progressOf, resolveStep, STEP_TITLE, stepError, stepHref,
  stepsFor, type PathOptions, type StepSlug,
} from "./funnel-core";
import { clearFunnelState, loadFunnelState, saveFunnelState, storageAvailable } from "./store";
import { JourneyTile } from "./journey-path";
import { ActionBar, FunnelTopBar, StepHeading } from "./ui";
import { StartCta, WegScreen } from "./weg-screen";
import {
  BirthYearScreen, ChildScreen, FamilyScreen, HelpScreen, NameScreen, PlaceScreen, ProfessionScreen, RoleScreen, SchoolScreen, StaffScreen,
  WeeklyGoalScreen, type ScreenProps,
} from "./screens";
import { AccountScreen, PlanCard } from "./account";
import { SavingView, useFunnelSave } from "./saving";
import styles from "./funnel.module.css";

type Boot =
  | { kind: "loading" }
  | { kind: "ready"; google: boolean; roleLocked: boolean; resumable: FunnelStateV1 | null };

/** Copy per step (SPEC-FLOW §2.3–2.5). */
function heading(step: StepSlug, s: FunnelStateV1): { title: ReactNode; help?: string } {
  const parent = s.role === "parent";
  switch (step) {
    case "rolle": return { title: "Wer bist du?", help: "Damit du nur siehst, was für dich passt." };
    case "name": return { title: "Wie heisst du?", help: parent ? "Dein Vorname reicht. Dein Kind sieht ihn, wenn ihr verbunden seid." : "Dein Vorname reicht. So sprechen wir dich in der App an." };
    case "jahrgang": return { title: "In welchem Jahr bist du geboren?", help: "Nur das Jahr. Wir brauchen es für den Schutz deiner Daten." };
    case "schule": return { title: "In welcher Klasse bist du?", help: "Dann zeigen wir dir, was gerade dran ist." };
    case "ort": return { title: "Wo suchst du deine Lehrstelle?", help: "Wir zeigen dir zuerst Lehrstellen in deiner Nähe." };
    case "beruf": return { title: "Welche Lehre interessiert dich?", help: "Wähl bis zu 3. Du kannst das später jederzeit ändern." };
    case "wochenziel": return { title: "Wie viele Bewerbungen schickst du pro Woche?", help: "Dein Wochenziel. Du kannst es im Dashboard jederzeit ändern." };
    case "hilfe": return { title: "Wobei sollen wir dir helfen?", help: "Wähl alles, was passt." };
    case "dabei": return { title: "Möchtest du deine Eltern einladen?", help: "Sie sehen nur, was du freigibst. Du kannst das jederzeit ändern." };
    case "begleiten": return { title: "Wobei möchtest du dein Kind begleiten?", help: "Wähl alles, was passt." };
    case "kind": return { title: "Ist dein Kind schon bei WendApply?" };
    case "zugang": return { title: "Lehrpersonen und Schulen nutzen WendApply mit einer Schullizenz", help: "Wähl, was für dich stimmt." };
    case "plan": return { title: `Dein Plan, ${s.firstName.trim() || "los geht’s"}`, help: "Das hast du gewählt. Passt alles?" };
    case "konto": return s.role === "staff" ? { title: "Dein Konto als Lehrperson", help: "Mit deinem Konto bist du bereit, sobald deine Schule dich freischaltet." } : { title: "Konto erstellen", help: "Mit deinem Konto ist dein Plan gespeichert." };
    default: return { title: "" };
  }
}

const SCREENS: Partial<Record<StepSlug, (p: ScreenProps) => ReactNode>> = {
  rolle: RoleScreen, name: NameScreen, jahrgang: BirthYearScreen, schule: SchoolScreen, ort: PlaceScreen, beruf: ProfessionScreen,
  wochenziel: WeeklyGoalScreen, hilfe: HelpScreen, begleiten: HelpScreen, dabei: FamilyScreen, kind: ChildScreen, zugang: StaffScreen,
};

/** Where focus goes when «Weiter» finds a missing / wrong answer. */
const FIELD_FOCUS: Record<string, string> = {
  rolle: "[data-testid=funnel-role] input", firstName: "#funnel-first-name", birthYear: "[data-testid=funnel-birth-year] input, #funnel-birth-year-select",
  schoolLevel: "[data-testid=funnel-school-level] input", classCode: "#funnel-class-code", canton: "#funnel-canton", place: "#funnel-place-input",
  inviteCode: "#funnel-invite-code", staffAccess: "[data-testid=funnel-staff] input",
};

const DECOR: Partial<Record<StepSlug, "bewerben" | "zusage" | "vertrag">> = { plan: "zusage", konto: "vertrag" };

/**
 * /start – the sign-up funnel (SPEC-FLOW). One client page; the step lives in `?schritt=` so every step has its own history
 * entry (browser back/forward, reload, deep link). Answers stay in this browser (localStorage, lib/funnel) until the account
 * exists; the last screen creates the account. `?nach=google` = authenticated completion mode (no account screen).
 */
export function Funnel() {
  const router = useRouter();
  // The query comes from <QueryProbe> (useSearchParams in its own Suspense boundary), not from useSearchParams here: so this
  // component prerenders screen 0 into the static HTML and hydrates it in place (QA M2 – LCP; no second copy, no swap).
  // `query === null` = not known yet (server render + hydration pass): screen 0 like the server HTML.
  const [query, setQuery] = useState<string | null>(null);
  const known = query !== null;
  const params = useMemo(() => new URLSearchParams(query ?? ""), [query]);
  const requested = params.get("schritt");
  const googleParam = params.get("nach") === "google";
  const urlNext = safeNextPath(params.get("next"));

  const [boot, setBoot] = useState<Boot>({ kind: "loading" });
  const [state, setState] = useState<FunnelStateV1>(() => emptyFunnelState());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [returnToPlan, setReturnToPlan] = useState(false);
  const [wegSeen, setWegSeen] = useState(false);
  const [sessionSave, setSessionSave] = useState(false);
  // Role preselected from an invite link (SPEC-FLOW §1.2): shown once on `rolle` («one tap Weiter»), not yet an answer.
  const [rolePreset, setRolePreset] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const visited = useRef<StepSlug[]>([]);
  // Step shown last + slide direction, adjusted during render (React «storing information from previous renders»).
  const [shown, setShown] = useState<{ step: StepSlug | null; dir: "forward" | "back" }>({ step: null, dir: "forward" });
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const familyInvite = useMemo(() => presetFromNext(state.next).familyInvite, [state.next]);
  const finePointer = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches, []);

  const ready = boot.kind === "ready";
  const opts: PathOptions = useMemo(() => (boot.kind === "ready" ? { google: boot.google, roleLocked: boot.roleLocked } : {}), [boot]);
  const google = boot.kind === "ready" && boot.google;
  const next = state.next ?? urlNext;
  // Only allow-listed app paths after the save (QA L2: `?next=%2F%2Fevil.example` + immediate session → /dashboard).
  const saver = useFunnelSave(funnelNextPath(next), { announceExisting: true });

  // The deep-link guard of the prerendered screen 0 (head script in app/layout.tsx) is no longer needed once the query is known.
  useEffect(() => { if (known) document.documentElement.removeAttribute("data-funnel-deep"); }, [known]);

  // ---- boot: saved answers, session check (logged-in people never see the funnel) ----
  useEffect(() => {
    if (!known) return;
    let alive = true;
    (async () => {
      const saved = loadFunnelState();
      const base = saved ?? emptyFunnelState();
      const preset = presetFromNext(urlNext);
      const merged: FunnelStateV1 = {
        ...base,
        next: urlNext ?? base.next,
        role: base.role ?? preset.role,
        classCode: base.classCode || preset.classCode,
        inviteCode: base.inviteCode || preset.inviteCode,
        parentKid: base.parentKid ?? (preset.inviteCode ? "code" : null),
      };
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const user = data.session?.user ?? null;
      if (!alive) return;
      if (user && !googleParam) {
        // Logged in: straight to the landing (which itself sends role-less Google accounts to ?nach=google).
        const path = await resolveLanding(urlNext).catch(() => "/dashboard");
        if (!alive) return;
        if (path.startsWith("/start")) { router.replace(path); setBoot({ kind: "loading" }); return; }
        router.replace(path); return;
      }
      if (googleParam && !user) {
        // `nach=google` only makes sense with a session: plain funnel instead.
        const q = new URLSearchParams(window.location.search); q.delete("nach");
        router.replace(`/start${q.toString() ? `?${q}` : ""}`);
      }
      let roleLocked = false;
      if (googleParam && user) {
        // Cross-device fallback: the role is already known from the sign-up metadata → never asked again.
        const meta = user.user_metadata ?? {};
        if (hasExplicitRole(meta)) {
          const known = meta.account_type === "parent" ? "parent" : meta.role === "teacher" ? "staff" : "student";
          merged.role = known; if (known === "staff") merged.staffAccess = "licence";
          roleLocked = true;
        }
      }
      setRolePreset(!base.role && !!preset.role && !roleLocked);
      setState(merged);
      setBoot({ kind: "ready", google: googleParam && !!user, roleLocked, resumable: canResume(saved) && storageAvailable() ? saved : null });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once per mode; step changes are handled below
  }, [googleParam, known]);

  const step: StepSlug = useMemo(() => {
    if (!ready) return "weg";
    const resolved = resolveStep(requested ?? (google ? null : "weg"), state, opts);
    const steps = stepsFor(state.role, state.staffAccess, opts);
    return rolePreset && steps.includes("rolle") && steps.indexOf(resolved) > steps.indexOf("rolle") ? "rolle" : resolved;
  }, [ready, requested, state, opts, google, rolePreset]);

  // Wrong / not-yet-allowed slug in the URL → replace with the step we show (never a 404).
  useEffect(() => {
    if (!ready) return;
    const shown = requested ?? (google ? null : "weg");
    if (shown !== step) router.replace(stepHref(step, { google, next: urlNext }), { scroll: false });
  }, [ready, requested, step, google, urlNext, router]);

  if (ready && shown.step !== step) {
    const steps = stepsFor(state.role, state.staffAccess, opts);
    const dir = shown.step && steps.indexOf(step) < steps.indexOf(shown.step) ? "back" : "forward";
    if (shown.step === "weg") setWegSeen(true);
    setShown({ step, dir });
    setErrors({});
  }

  // Step change: remember it in the visit list, focus the H1, scroll to top (not on the very first screen).
  const focusedStep = useRef<StepSlug | null>(null);
  useEffect(() => {
    if (!ready || focusedStep.current === step) return;
    const first = focusedStep.current === null;
    focusedStep.current = step;
    if (visited.current[visited.current.length - 1] !== step) visited.current.push(step);
    if (!first) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }, [ready, step]);

  // Persist (debounced 300 ms; never e-mail/password – the state type has no such field).
  useEffect(() => {
    if (!ready) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    // Not on `weg`: the intro must not overwrite the saved step (resume card after a reload, SPEC-FLOW §4.9).
    // Only a write that is still waiting is flushed: a cleared state (save done, «Neu beginnen») is never written back.
    let pending = step !== "weg";
    const write = () => { if (!pending) return; pending = false; saveFunnelState({ ...state, step }); };
    writeTimer.current = setTimeout(write, 300);
    // Leaving the tab right after «Weiter» (phone swipe-close) must not lose the step (B4): flush the waiting write now.
    const onVisibility = () => { if (document.visibilityState === "hidden") write(); };
    window.addEventListener("pagehide", write);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      window.removeEventListener("pagehide", write);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, state, step]);

  const update = useCallback((patch: Partial<FunnelStateV1>) => {
    setState((s) => ({ ...s, ...patch, updatedAt: Date.now() }));
    setErrors((e) => {
      const keys = Object.keys(patch);
      if (!keys.some((k) => e[k] || (k === "role" && e.rolle))) return e;
      const copy = { ...e }; for (const k of keys) delete copy[k]; if (keys.includes("role")) delete copy.rolle; return copy;
    });
  }, []);

  const go = useCallback((target: StepSlug, mode: "push" | "replace" = "push") => {
    const href = stepHref(target, { google, next: urlNext });
    if (mode === "push") router.push(href, { scroll: false }); else router.replace(href, { scroll: false });
  }, [google, urlNext, router]);

  const advance = useCallback((from: StepSlug, s: FunnelStateV1) => {
    const problem = stepError(from, s);
    if (problem) {
      setErrors({ [problem.field]: problem.message });
      requestAnimationFrame(() => {
        const selector = FIELD_FOCUS[problem.field];
        (selector ? document.querySelector<HTMLElement>(selector) : null)?.focus?.();
      });
      return;
    }
    if (from === "rolle") setRolePreset(false);
    saveFunnelState({ ...s, step: from, updatedAt: Date.now() });
    if (returnToPlan && from !== "plan") { setReturnToPlan(false); go("plan"); return; }
    const { next: target } = neighbours(from, s, opts);
    if (target) go(target);
  }, [go, opts, returnToPlan]);

  const back = useCallback(() => {
    const { prev } = neighbours(step, state, opts);
    if (!prev) return;
    const v = visited.current;
    if (v.length >= 2 && v[v.length - 2] === prev) { v.pop(); router.back(); }
    else go(prev, "replace");
  }, [step, state, opts, router, go]);

  const restart = () => {
    clearFunnelState();
    const fresh = { ...emptyFunnelState(), next: urlNext, ...(() => { const p = presetFromNext(urlNext); return { role: p.role, classCode: p.classCode, inviteCode: p.inviteCode, parentKid: p.inviteCode ? "code" as const : null }; })() };
    setState(fresh);
    setResumeDismissed(true);
  };

  // ---- render ----
  // Before the boot finished, screen 0 is shown exactly like the server copy (no «Einen Moment …» flash, M2) when it is the
  // likely target; the boot may still swap the CTA for the resume card or navigate away (logged in).
  // Server render of this component (dev, or if /start ever becomes dynamic): nothing – the Suspense fallback in
  // app/start/page.tsx is the one server copy of screen 0. Otherwise the stream carries a second, hidden copy until React swaps it.
  const wegFirst = !ready && !googleParam && (requested === null || requested === "weg");
  const probe = <Suspense fallback={null}><QueryProbe onQuery={setQuery} /></Suspense>;
  const idle = saver.phase === "idle" && !sessionSave;
  if (idle && (wegFirst || (ready && step === "weg"))) {
    const resumable = ready && boot.resumable && !resumeDismissed ? boot.resumable : null;
    const login = google ? null : loginHref(next);
    const cta = resumable
      ? <ResumeCard state={resumable} onResume={() => go(resumable.step as StepSlug)} onRestart={() => restart()} />
      : <StartCta href={stepHref("rolle", { google, next: urlNext })} login={login} />;
    return <WegScreen cta={cta} login={login} animate={!wegSeen && !resumable} headingRef={headingRef} pending={!known}>{probe}</WegScreen>;
  }

  if (!ready || !idle) {
    return (
      <Shell>
        {probe}
        <main className="flex min-h-[60dvh] items-center justify-center">
          {saver.phase === "idle" && !sessionSave ? (
            <p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p>
          ) : <SavingView phase={saver.phase === "idle" ? "saving" : saver.phase} errorKind={saver.errorKind} onRetry={() => saver.save()} onSkip={saver.skip} />}
        </main>
      </Shell>
    );
  }

  const steps = stepsFor(state.role, state.staffAccess, opts);
  const progress = progressOf(step, steps);
  const login = google ? null : loginHref(next);

  const { title, help } = heading(step, state);
  const Screen = SCREENS[step];
  const prev = neighbours(step, state, opts).prev;
  const onBack = prev && !(google && prev === "weg") ? back : null;
  const animClass = shown.dir === "back" ? styles.stepBack : styles.stepForward;
  const decor = DECOR[step];

  // primary button per step
  let primary = "Weiter";
  let onPrimary = () => advance(step, state);
  if (step === "plan") {
    primary = google ? "Plan speichern" : "Konto erstellen";
    if (google) onPrimary = () => { saveFunnelState(state); void saver.save(); };
  }
  if (step === "zugang") {
    if (state.staffAccess === "pilot") { primary = "Pilot anfragen"; onPrimary = () => router.push("/pilot"); }
    else if (state.staffAccess === "admin") { primary = "Schulen-Infos ansehen"; onPrimary = () => router.push("/schulen#einfuehrung"); }
    else if (google && state.staffAccess === "licence") { primary = "Konto einrichten"; onPrimary = () => { saveFunnelState(state); void saver.save(); }; }
  }

  return (
    <Shell>
      {probe}
      <FunnelTopBar onBack={onBack} progress={progress} loginHref={login} />
      <main key={step} className={cn("pt-4 lg:pt-10", animClass)} data-testid={`funnel-step-${step}`} data-step={step}>
        <StepHeading ref={headingRef} title={title} help={help} progress={progress} aside={decor ? <JourneyTile milestone={decor} /> : undefined} />
        {google && step === (opts.roleLocked ? "name" : "rolle") && opts.roleLocked && (
          <p role="note" className="mt-4 rounded-[var(--radius-md)] bg-[var(--info-bg)] px-3 py-2.5 text-small text-[var(--info-fg)]" data-testid="funnel-other-device">
            Deine Antworten sind auf dem anderen Gerät. Beantworte die Fragen hier kurz noch einmal oder überspring sie.
          </p>
        )}
        <div className="mt-6">
          {step === "plan" ? <PlanCard state={state} onEdit={(target) => { setReturnToPlan(true); go(target); }} />
            : step === "konto" ? <AccountScreen state={state} onSession={() => { setSessionSave(true); void saver.save(); }} />
            : Screen ? <Screen state={state} update={update} errors={errors} submit={() => advance(step, state)} autoFocusText={finePointer}
                familyInvite={familyInvite}
                pickAndAdvance={(patch) => { const s = { ...state, ...patch }; update(patch); setTimeout(() => advance(step, s), 250); }} /> : null}
        </div>
        {step !== "konto" && (
          <ActionBar primary={primary} onPrimary={onPrimary} onBack={onBack}
            skip={isSkippable(step) ? { onSkip: () => { update(step === "dabei" ? { family: "spaeter" } : { help: [] }); const t = neighbours(step, state, opts).next; if (t) go(returnToPlan ? "plan" : t); } } : null}>
            {google && step === (opts.roleLocked ? "name" : "rolle") && opts.roleLocked && (
              <p className="mt-1 text-center lg:text-left"><button type="button" data-testid="funnel-other-device-skip" onClick={() => { void saver.save({ skipped: true, role: state.role }); }} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline decoration-[var(--line)] decoration-2 underline-offset-4">Überspringen</button></p>
            )}
          </ActionBar>
        )}
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div data-ui="app" className="workspace-bg min-h-[100dvh] overflow-x-clip px-4 sm:px-6">
      <div className="mx-auto w-full max-w-[560px] pb-4 data-[wide]:max-w-[1120px] [&:has([data-testid=journey-path])]:max-w-[1120px]">{children}</div>
    </div>
  );
}

function ResumeCard({ state, onResume, onRestart }: { state: FunnelStateV1; onResume: () => void; onRestart: () => void }) {
  const title = STEP_TITLE[state.step as StepSlug] ?? "Dein Weg";
  return (
    <section className="panel space-y-3 p-4 shadow-[var(--shadow-md)]" aria-labelledby="funnel-resume-title" data-testid="funnel-resume">
      <h2 id="funnel-resume-title" className="text-heading">Weitermachen, wo du warst?</h2>
      <p className="text-body">Du warst bei «{title}». Deine Antworten sind auf diesem Gerät gespeichert.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onResume} data-testid="funnel-resume-continue">Weitermachen</Button>
        <Button size="lg" variant="secondary" onClick={onRestart} data-testid="funnel-resume-restart">Neu beginnen</Button>
      </div>
    </section>
  );
}

/** Reports the query string (and every change by router.push / back / forward). Alone in its Suspense boundary: in the static
 *  prerender only this null-rendering probe bails out to the client, the funnel around it stays in the HTML. */
function QueryProbe({ onQuery }: { onQuery: (query: string) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => { onQuery(query); }, [query, onQuery]);
  return null;
}
