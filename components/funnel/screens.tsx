"use client";

import { useState } from "react";
import { GraduationCap, Heart, Minus, Plus, UserRound } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { LocationAutocomplete } from "@/components/job-search/location-autocomplete";
import { birthYearOptions } from "@/lib/family-core";
import { CANTONS } from "@/lib/geo/cantons";
import { PROFESSION_SUGGESTIONS, SCHOOL_LEVELS } from "@/lib/onboarding-core";
import type { FunnelStateV1 } from "@/lib/funnel/types";
import { cn } from "@/lib/utils";
import {
  addFunnelProfession, FUNNEL_LIMITS_UI, HELP_LABELS_PARENT, HELP_LABELS_STUDENT, likelyBirthYears, mayNeedParentalConsent, normalizeCode,
  startYearOptions, toggleProfession, weeklyGoalFeedback,
} from "./funnel-core";
import { ChipGroup, ChoiceTiles, FieldError, InfoNote, type TileOption } from "./ui";
import styles from "./funnel.module.css";

export type ScreenProps = {
  state: FunnelStateV1;
  update: (patch: Partial<FunnelStateV1>) => void;
  /** field → message of the last «Weiter» */
  errors: Record<string, string>;
  /** Enter in a text field */
  submit: () => void;
  /** pointer tap on a single-choice tile that should advance (role screen) */
  pickAndAdvance?: (patch: Partial<FunnelStateV1>) => void;
  /** desktop (pointer: fine): autofocus the first text field */
  autoFocusText?: boolean;
  familyInvite?: "parent" | "child" | null;
};

const err = (field: string) => `funnel-${field}-error`;

// ---- S1 rolle ----
const ROLE_OPTIONS: TileOption<NonNullable<FunnelStateV1["role"]>>[] = [
  { value: "student", label: "Schüler:in", hint: "Ich suche eine Lehrstelle.", icon: UserRound },
  { value: "parent", label: "Elternteil", hint: "Ich begleite mein Kind bei der Lehrstellensuche.", icon: Heart },
  { value: "staff", label: "Lehrperson oder Schule", hint: "Ich begleite Klassen oder verwalte WendApply für eine Schule.", icon: GraduationCap },
];
export function RoleScreen({ state, update, errors, pickAndAdvance }: ScreenProps) {
  return (
    <>
      <ChoiceTiles legend="Wer bist du?" testId="funnel-role" name="funnel-role" options={ROLE_OPTIONS} value={state.role} tall columns="one"
        onChange={(role) => update({ role })} onPointerPick={(role) => pickAndAdvance?.({ role })} error={errors.rolle} errorId={err("rolle")} />
      {errors.rolle && <FieldError id={err("rolle")}>{errors.rolle}</FieldError>}
    </>
  );
}

// ---- S2 / P2 name ----
export function NameScreen({ state, update, errors, submit, autoFocusText }: ScreenProps) {
  return (
    <Field label="Vorname" htmlFor="funnel-first-name" error={errors.firstName}>
      <Input id="funnel-first-name" data-testid="funnel-first-name" autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" maxLength={80}
        autoFocus={autoFocusText} value={state.firstName} onChange={(e) => update({ firstName: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} className="min-h-12 !text-base" />
    </Field>
  );
}

// ---- S3 jahrgang ----
export function BirthYearScreen({ state, update, errors }: ScreenProps) {
  const likely = likelyBirthYears();
  const [other, setOther] = useState(state.birthYear !== null && !likely.includes(state.birthYear));
  return (
    <div className="space-y-4">
      {!other ? (
        <ChipGroup label="Geburtsjahr" testId="funnel-birth-year" options={likely} value={state.birthYear} onChange={(birthYear) => update({ birthYear })}
          error={errors.birthYear} errorId={err("birthYear")} className="grid grid-cols-3 gap-2" />
      ) : (
        <Field label="Geburtsjahr" htmlFor="funnel-birth-year-select" error={errors.birthYear}>
          <Select id="funnel-birth-year-select" data-testid="funnel-birth-year-select" value={state.birthYear ?? ""} onChange={(e) => update({ birthYear: e.target.value ? Number(e.target.value) : null })} className="min-h-12 !text-base">
            <option value="">Jahr wählen</option>
            {birthYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
      )}
      {!other && errors.birthYear && <FieldError id={err("birthYear")}>{errors.birthYear}</FieldError>}
      <button type="button" data-testid="funnel-birth-year-other" onClick={() => setOther((v) => !v)} className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]">
        {other ? "Jahr aus der Liste wählen" : "Anderes Jahr"}
      </button>
      {mayNeedParentalConsent(state.birthYear) && (
        <InfoNote testId="funnel-under16-note">Du bist vielleicht unter 16. Du kannst WendApply trotzdem sofort nutzen. Deine Eltern sehen nur etwas, wenn du sie einlädst und ein Elternteil zuerst zustimmt. Sprich mit deinen Eltern oder deiner Lehrperson, wenn du unsicher bist.</InfoNote>
      )}
    </div>
  );
}

// ---- S4 schule ----
export function SchoolScreen({ state, update, errors }: ScreenProps) {
  const [withCode, setWithCode] = useState(!!state.classCode);
  const options: TileOption<string>[] = SCHOOL_LEVELS.map((l) => ({ value: l, label: l }));
  return (
    <div className="space-y-5">
      <ChoiceTiles legend="In welcher Klasse bist du?" testId="funnel-school-level" options={options} value={state.schoolLevel || null}
        onChange={(schoolLevel) => update({ schoolLevel })} error={errors.schoolLevel} errorId={err("schoolLevel")} />
      {errors.schoolLevel && <FieldError id={err("schoolLevel")}>{errors.schoolLevel}</FieldError>}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" data-testid="funnel-class-code-toggle" checked={withCode} onChange={(e) => { setWithCode(e.target.checked); if (!e.target.checked) update({ classCode: "" }); }} className="h-6 w-6 shrink-0 accent-[var(--brand)]" />
        Ich habe einen Klassencode von meiner Lehrperson
      </label>
      {withCode && (
        <Field label="Klassencode" htmlFor="funnel-class-code" error={errors.classCode} hint={errors.classCode ? undefined : "Den Code bekommst du von deiner Lehrperson. Ohne Code kannst du WendApply 7 Tage gratis testen."}>
          <Input id="funnel-class-code" data-testid="funnel-class-code" autoCapitalize="characters" inputMode="text" autoComplete="off" spellCheck={false}
            maxLength={24} value={state.classCode} onChange={(e) => update({ classCode: normalizeCode(e.target.value, FUNNEL_LIMITS_UI.classCodeMax) })} className="min-h-12 !text-base uppercase tracking-[.08em]" />
        </Field>
      )}
    </div>
  );
}

// ---- S5 ort ----
export function PlaceScreen({ state, update, errors, autoFocusText }: ScreenProps) {
  return (
    <div className="space-y-5">
      <Field label="Kanton" htmlFor="funnel-canton" error={errors.canton}>
        <Select id="funnel-canton" data-testid="funnel-canton" autoFocus={autoFocusText} value={state.canton} onChange={(e) => update({ canton: e.target.value })} className="min-h-12 !text-base">
          <option value="">Kanton wählen</option>
          {CANTONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
      </Field>
      <div data-testid="funnel-place">
        <LocationAutocomplete id="funnel-place-input" label="Ort oder PLZ (freiwillig)" placeholder="z. B. Winterthur" maxLength={FUNNEL_LIMITS_UI.place}
          value={state.place} onChange={(place) => update({ place: place.slice(0, FUNNEL_LIMITS_UI.place) })} />
        {errors.place && <FieldError id={err("place")}>{errors.place}</FieldError>}
      </div>
    </div>
  );
}

// ---- S6 beruf ----
export function ProfessionScreen({ state, update }: ScreenProps) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const years = startYearOptions();
  const custom = state.professions.filter((p) => !(PROFESSION_SUGGESTIONS as readonly string[]).includes(p));
  const chips = [...PROFESSION_SUGGESTIONS, ...custom];
  function apply(result: { list: string[]; full: boolean }) {
    setNotice(result.full ? "Du hast schon 3 gewählt. Entferne zuerst einen." : "");
    if (result.list !== state.professions) update({ professions: result.list, unsure: false, startYear: result.list.length ? state.startYear ?? years[0] : state.startYear });
  }
  function addDraft() { if (!draft.trim()) return; apply(addFunnelProfession(state.professions, draft)); setDraft(""); }
  return (
    <div className="space-y-5">
      <fieldset data-testid="funnel-professions">
        <legend className="sr-only">Berufe</legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((p) => {
            const on = state.professions.includes(p);
            return (
              <label key={p} data-selected={on || undefined} className={cn("inline-flex min-h-11 cursor-pointer items-center rounded-full border-[length:var(--border-w)] px-3.5 text-sm font-semibold focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]", styles.tile,
                on ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--field-border)] bg-[var(--field-bg)] hover:bg-[var(--surface-2)]")}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => apply(toggleProfession(state.professions, p))} />{p}
              </label>
            );
          })}
        </div>
      </fieldset>
      <p aria-live="polite" className="text-small font-medium text-[var(--warning-fg,var(--ink))]" data-testid="funnel-professions-notice">{notice}</p>
      <div className="flex items-end gap-2">
        <Field label="Anderer Beruf" htmlFor="funnel-profession-other" className="flex-1">
          <Input id="funnel-profession-other" data-testid="funnel-profession-other" maxLength={FUNNEL_LIMITS_UI.profession} enterKeyHint="done" value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }} className="min-h-12 !text-base" />
        </Field>
        <button type="button" onClick={addDraft} className="min-h-12 shrink-0 rounded-full border-[length:var(--border-w)] border-[var(--control-edge)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-2)]">Hinzufügen</button>
      </div>
      <ChoiceTiles legend="Noch unsicher" testId="funnel-unsure" multi options={[{ value: "unsure", label: "Weiss ich noch nicht" }]} value={state.unsure ? ["unsure"] : []}
        onChange={() => update(state.unsure ? { unsure: false } : { unsure: true, professions: [], startYear: null })} />
      {state.unsure && <p className="text-body text-muted" aria-live="polite">Kein Problem. In der App findest du Berufe zum Entdecken.</p>}
      {state.professions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold" id="funnel-start-year-label">Ab wann?</p>
          <ChipGroup label="Ab wann?" testId="funnel-start-year" options={years} value={state.startYear} onChange={(startYear) => update({ startYear })} render={(y) => `Sommer ${y}`} />
        </div>
      )}
    </div>
  );
}

// ---- S7 wochenziel ----
export function WeeklyGoalScreen({ state, update }: ScreenProps) {
  const [more, setMore] = useState(state.weeklyGoal > 5);
  const n = state.weeklyGoal;
  return (
    <div className="space-y-4">
      {!more ? (
        <ChipGroup label="Bewerbungen pro Woche" testId="funnel-weekly-goal" options={[1, 2, 3, 4, 5]} value={n <= 5 ? n : null} onChange={(weeklyGoal) => update({ weeklyGoal })}
          className="grid grid-cols-5 gap-2" chipClassName="min-h-14 min-w-0 text-lg" />
      ) : (
        <div className="flex items-center gap-4" data-testid="funnel-weekly-goal-stepper">
          <button type="button" aria-label="Eine weniger" onClick={() => update({ weeklyGoal: Math.max(6, n - 1) })} disabled={n <= 6} className="flex h-12 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--control-edge)] bg-[var(--surface)] disabled:opacity-40"><Minus size={20} aria-hidden /></button>
          <output aria-live="polite" className="min-w-16 text-center font-display text-4xl font-extrabold tabular" data-testid="funnel-weekly-goal-value">{n}</output>
          <button type="button" aria-label="Eine mehr" onClick={() => update({ weeklyGoal: Math.min(10, n + 1) })} disabled={n >= 10} className="flex h-12 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--control-edge)] bg-[var(--surface)] disabled:opacity-40"><Plus size={20} aria-hidden /></button>
        </div>
      )}
      <p key={n > 5 ? 6 : n} aria-live="polite" className={cn("min-h-12 text-body", styles.fadeSwap)} data-testid="funnel-weekly-goal-feedback">{weeklyGoalFeedback(n)}</p>
      <button type="button" data-testid="funnel-weekly-goal-more" onClick={() => { const on = !more; setMore(on); update({ weeklyGoal: on ? Math.max(6, n) : Math.min(5, n) }); }}
        className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]">
        {more ? "Höchstens 5" : "Mehr als 5"}
      </button>
    </div>
  );
}

// ---- S8 hilfe / P3 begleiten ----
export function HelpScreen({ state, update }: ScreenProps) {
  const labels = state.role === "parent" ? HELP_LABELS_PARENT : HELP_LABELS_STUDENT;
  const options: TileOption<string>[] = Object.entries(labels).map(([value, label]) => ({ value, label }));
  return (
    <ChoiceTiles legend={state.role === "parent" ? "Wobei möchtest du dein Kind begleiten?" : "Wobei sollen wir dir helfen?"} testId="funnel-help" multi options={options} value={state.help} columns="one"
      onChange={(v) => update({ help: state.help.includes(v) ? state.help.filter((h) => h !== v) : [...state.help, v].slice(0, 5) })} />
  );
}

// ---- S9 dabei ----
export function FamilyScreen({ state, update, familyInvite }: ScreenProps) {
  if (familyInvite === "child") return <InfoNote testId="funnel-family-invited">Du trittst nach dem Start der Familie bei, die dich eingeladen hat.</InfoNote>;
  return (
    <div className="space-y-4">
      <ChoiceTiles legend="Möchtest du deine Eltern einladen?" testId="funnel-family" options={[{ value: "jetzt", label: "Ja, nach dem Start" }, { value: "spaeter", label: "Später" }]}
        value={state.family ?? "spaeter"} onChange={(family) => update({ family: family as FunnelStateV1["family"] })} columns="one" />
      {state.family === "jetzt" && mayNeedParentalConsent(state.birthYear) && <InfoNote>Ein Elternteil muss zuerst zustimmen, bevor es etwas sieht. Das dauert nur einen Klick.</InfoNote>}
    </div>
  );
}

// ---- P4 kind ----
export function ChildScreen({ state, update, errors, familyInvite }: ScreenProps) {
  if (familyInvite === "parent") return <InfoNote testId="funnel-kid-invited">Du hast eine Einladung von deinem Kind. Nach dem Start seid ihr verbunden.</InfoNote>;
  return (
    <div className="space-y-4">
      <ChoiceTiles legend="Ist dein Kind schon bei WendApply?" testId="funnel-kid" columns="one" value={state.parentKid ?? "einladen"}
        options={[{ value: "einladen", label: "Noch nicht – ich lade es nach dem Start ein" }, { value: "code", label: "Ja, ich habe einen Code von meinem Kind" }, { value: "spaeter", label: "Später" }]}
        onChange={(parentKid) => update({ parentKid: parentKid as FunnelStateV1["parentKid"] })} />
      {state.parentKid === "code" && (
        <Field label="Einladungscode" htmlFor="funnel-invite-code" error={errors.inviteCode} hint={errors.inviteCode ? undefined : "8 Zeichen, zum Beispiel ABCD 2345."}>
          <Input id="funnel-invite-code" data-testid="funnel-invite-code" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12}
            value={state.inviteCode} onChange={(e) => update({ inviteCode: normalizeCode(e.target.value, 8) })} className="min-h-12 !text-base uppercase tracking-[.08em]" />
        </Field>
      )}
    </div>
  );
}

// ---- T2 zugang ----
export const STAFF_OPTIONS: TileOption<NonNullable<FunnelStateV1["staffAccess"]>>[] = [
  { value: "licence", label: "Meine Schule hat schon eine Lizenz", hint: "Erstell dein Konto. Deine Schuladministration schaltet dich frei." },
  { value: "pilot", label: "Wir möchten WendApply ausprobieren", hint: "30-Tage-Pilot für eure Schule, gratis." },
  { value: "admin", label: "Ich verwalte WendApply für meine Schule", hint: "Lizenz anfragen oder Offerte erhalten." },
];
export function StaffScreen({ state, update, errors }: ScreenProps) {
  return (
    <div className="space-y-4">
      <ChoiceTiles legend="Wie nutzt deine Schule WendApply?" testId="funnel-staff" options={STAFF_OPTIONS} value={state.staffAccess} columns="one" tall
        onChange={(staffAccess) => update({ staffAccess })} error={errors.staffAccess} errorId={err("staffAccess")} />
      {errors.staffAccess && <FieldError id={err("staffAccess")}>{errors.staffAccess}</FieldError>}
      <p className="text-small text-muted">Du bist Schüler:in und hast einen Klassencode? Wähl oben «Zurück» und dann «Schüler:in».</p>
    </div>
  );
}
