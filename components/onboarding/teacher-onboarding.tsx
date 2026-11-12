"use client";

import { isPlaceholderName } from "@/lib/profile-name-utils";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, GraduationCap } from "lucide-react";
import { CodeActions, errorMessage } from "@/components/classes/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { AuthFrame, AuthSteps, AuthTitle } from "./auth-frame";
import { createClass } from "@/lib/classes";
import { clearRoleCache, markTeacherOnboarded, TEACHER_HOME } from "@/lib/role";
import { getMySocialProfile, updateMySocialProfile } from "@/lib/social";
import type { SchoolClass } from "@/types";

const STEPS = ["Name", "Erste Klasse"];

function schoolYearDefault() { const now = new Date(); const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; return `${start}/${String(start + 1).slice(2)}`; }

/** First login of a teacher (the role was already chosen at sign-up or in the role picker and is not asked again): set display name, create the first class. Every step can be skipped; the flag is stored in the auth metadata. */
export function TeacherOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [year, setYear] = useState(schoolYearDefault());
  const [created, setCreated] = useState<SchoolClass | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getMySocialProfile().then((p) => setName((current) => current || (isPlaceholderName(p.displayName) ? "" : p.displayName))).catch(() => {}); }, []);

  async function finish(path = TEACHER_HOME) { await markTeacherOnboarded().catch(() => {}); clearRoleCache(); router.replace(path); }
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); } }

  const saveName = (event: FormEvent) => { event.preventDefault(); void run(async () => { if (name.trim()) await updateMySocialProfile({ displayName: name.trim() }); clearRoleCache(); setStep(1); }); };
  const makeClass = (event: FormEvent) => { event.preventDefault(); if (!className.trim()) { setError("Bitte gib deiner Klasse einen Namen."); return; } void run(async () => { setCreated(await createClass(className.trim(), year.trim())); }); };

  return (
    <AuthFrame className="max-w-[560px]">
        <AuthSteps steps={STEPS} current={step} allDone={Boolean(created)}>{(state, i) => (state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1)}</AuthSteps>

        <div className="panel space-y-5 p-5 sm:p-7">
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}

          {step === 0 && (
            <form onSubmit={saveName} className="space-y-5">
              <AuthTitle title={<>Wie sollen dich deine Klassen <span className="marker">nennen</span>?</>}>Dieser Name ist für deine Schülerinnen und Schüler sichtbar, zum Beispiel „Frau Keller“.</AuthTitle>
              <Field label="Anzeigename" htmlFor="display-name"><Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" data-autofocus /></Field>
              <Button type="submit" full size="lg" loading={busy}>Weiter <ArrowRight size={16} /></Button>
            </form>
          )}

          {step === 1 && !created && (
            <form onSubmit={makeClass} className="space-y-5">
              <AuthTitle title={<>Deine <span className="marker">erste Klasse</span></>}>Danach lädst du deine Schülerinnen und Schüler per Link oder Code ein. Du kannst weitere Klassen jederzeit hinzufügen.</AuthTitle>
              <Field label="Klassenname" htmlFor="class-name"><Input id="class-name" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="z. B. Informatik 4a" maxLength={60} data-autofocus /></Field>
              <Field label="Schuljahr" htmlFor="school-year"><Input id="school-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/27" maxLength={20} /></Field>
              <Button type="submit" full size="lg" loading={busy} icon={<GraduationCap size={17} />}>Klasse erstellen</Button>
              <button type="button" onClick={() => void run(() => finish())} className="mx-auto flex min-h-11 items-center px-3 text-sm font-medium text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)]">Später erledigen</button>
            </form>
          )}

          {step === 1 && created && (
            <div className="space-y-5">
              <span className="sticker sticker-mint animate-sticker"><Check size={14} strokeWidth={3} aria-hidden />Geschafft</span>
              <AuthTitle title={<>„{created.name}“ ist <span className="marker">bereit</span></>}>Gib diesen Code an deine Schülerinnen und Schüler weiter. Sie entscheiden selbst, was sie mit dir teilen.</AuthTitle>
              <div className="flex"><CodeActions code={created.joinCode} name={created.name} /></div>
              <Button variant="sun" full size="lg" loading={busy} onClick={() => void run(() => finish(`/teacher/classes/${created.id}`))}>Zur Klasse</Button>
              <button type="button" onClick={() => void run(() => finish())} className="mx-auto flex min-h-11 items-center px-3 text-sm font-medium text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)]">Zur Übersicht</button>
            </div>
          )}
        </div>
    </AuthFrame>
  );
}
