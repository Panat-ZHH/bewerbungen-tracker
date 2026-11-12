"use client";

import { useCallback, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { setClassSharingV2 } from "@/lib/classes";
import type { ClassMembership } from "@/types";
import { defaultConsent, type ConsentChoice } from "@/lib/consent";
import { cleanNameInput, getMyNameStatus, setMyDisplayName, setMyUnder16, type NameStatus } from "@/lib/profile-names";
import { ConsentSwitches } from "./consent-switches";
import { PrivacyPanel } from "./privacy-panel";

/**
 * Everything a student confirms when joining a class (P0 items 6 + 7): real name if still missing, age band (under 16 / 16+),
 * and the three consent switches, all OFF unless the student is 16+. Shared by the join dialog and the invite-link page.
 */
export function useJoinConsent() {
  const [status, setStatus] = useState<NameStatus | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [age, setAge] = useState<"u16" | "o16" | null>(null);
  const [choice, setChoice] = useState<ConsentChoice>(defaultConsent(null));

  /** Call when the join step opens. */
  const load = useCallback(async () => {
    const s = await getMyNameStatus().catch(() => null);
    setStatus(s); setFirst(""); setLast("");
    setAge(s?.under16 === true ? "u16" : s?.under16 === false ? "o16" : null);
    setChoice(defaultConsent(s?.under16 ?? null));
  }, []);

  const needsName = status?.needsName ?? false;
  const typedName = cleanNameInput(first, last);
  const ready = (!needsName || (typedName !== null && first.trim() !== "" && last.trim() !== "")) && age !== null;

  /** Saves name + age band, runs the join call, then stores the chosen switches. Returns the membership with the final flags. */
  const run = useCallback(async (join: () => Promise<ClassMembership>) => {
    if (needsName && typedName) await setMyDisplayName(typedName);
    const under16 = age === "u16";
    if (age && status?.under16 !== under16) await setMyUnder16(under16);
    const membership = await join();
    await setClassSharingV2(membership.classId, choice.share, choice.companies, choice.status);
    return { membership, consent: choice };
  }, [age, choice, needsName, status, typedName]);

  const fields = (teacherName?: string) => (
    <div className="space-y-4 text-left">
      {needsName && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Wie heisst du?</legend>
          <p className="text-small text-muted">Deine Lehrperson sieht deinen Namen in der Klassenliste. Bitte gib deinen echten Namen an.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Vorname" htmlFor="join-first"><Input id="join-first" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" maxLength={30} /></Field>
            <Field label="Nachname" htmlFor="join-last"><Input id="join-last" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" maxLength={30} /></Field>
          </div>
        </fieldset>
      )}
      <fieldset className="space-y-1">
        <legend className="text-sm font-bold">Wie alt bist du?</legend>
        <p className="text-small text-muted">Wenn du unter 16 bist, ist das Teilen zu Beginn ausgeschaltet. Du entscheidest unten selbst.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {([["u16", "Unter 16"], ["o16", "16 oder älter"]] as const).map(([value, label]) => (
            <label key={value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[length:var(--border-w)] px-4 text-sm font-semibold transition-colors has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)] ${age === value ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--outline)] bg-[var(--surface)]"}`}>
              <input type="radio" name="join-age" className="sr-only" checked={age === value} onChange={() => { setAge(value); setChoice(defaultConsent(value === "u16")); }} />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <PrivacyPanel variant="class" teacherName={teacherName} />
      <div>
        <p className="font-display text-base font-bold">Das teilst du ab dem Beitritt</p>
        <div className="rows mt-1"><ConsentSwitches value={choice} onChange={(next) => setChoice((c) => ({ ...c, ...next }))} /></div>
      </div>
    </div>
  );

  return { load, ready, run, fields };
}
