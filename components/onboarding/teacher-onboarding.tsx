"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, GraduationCap } from "lucide-react";
import { CodeActions, errorMessage } from "@/components/classes/shared";
import { RoleCards } from "@/components/onboarding/role-cards";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { createClass } from "@/lib/classes";
import { chooseRole, clearRoleCache, markTeacherOnboarded, STUDENT_HOME, TEACHER_HOME } from "@/lib/role";
import { getMySocialProfile, updateMySocialProfile } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import type { SchoolClass, UserRole } from "@/types";

const STEPS = ["Rolle", "Name", "Erste Klasse"];

function schoolYearDefault() { const now = new Date(); const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; return `${start}/${String(start + 1).slice(2)}`; }

/** First login of a teacher: confirm role, set display name, create the first class. Every step can be skipped; the flag is stored in the auth metadata. */
export function TeacherOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<UserRole>("teacher");
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [year, setYear] = useState(schoolYearDefault());
  const [created, setCreated] = useState<SchoolClass | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getMySocialProfile().then((p) => setName(p.displayName)).catch(() => {}); }, []);

  async function finish(path = TEACHER_HOME) { await markTeacherOnboarded().catch(() => {}); clearRoleCache(); router.replace(path); }
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); } }

  const confirmRole = () => run(async () => {
    if (role === "student") { const { data } = await supabase.auth.getUser(); if (data.user) await chooseRole(data.user, "student"); router.replace(STUDENT_HOME); return; }
    setStep(1);
  });
  const saveName = (event: FormEvent) => { event.preventDefault(); void run(async () => { if (name.trim()) await updateMySocialProfile({ displayName: name.trim() }); clearRoleCache(); setStep(2); }); };
  const makeClass = (event: FormEvent) => { event.preventDefault(); if (!className.trim()) { setError("Bitte gib deiner Klasse einen Namen."); return; } void run(async () => { setCreated(await createClass(className.trim(), year.trim())); }); };

  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="animate-rise w-full max-w-[560px]">
        <Image src="/logo.png" alt="WendApply" width={56} height={56} className="logo-tile mx-auto rounded-[16px] bg-[#f2f7ff] p-1 shadow-[var(--shadow-md)]" priority />
        <ol className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2" aria-label="Fortschritt">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
              <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${i <= step ? "bg-[var(--brand)] text-white" : "bg-[var(--neutral-bg)] text-muted"}`}>{i < step || created ? <Check size={13} /> : i + 1}</span>
              <span className={`text-small hidden sm:inline ${i === step ? "font-semibold" : "text-muted"}`}>{label}</span>
              {i < STEPS.length - 1 && <span aria-hidden className="h-px w-5 bg-[var(--line)]" />}
            </li>
          ))}
        </ol>

        <div className="glass-surface mt-5 space-y-5 p-5 sm:p-7">
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}

          {step === 0 && (
            <>
              <div className="text-center"><h1 className="text-title">Willkommen bei WendApply</h1><p className="mt-2 text-sm text-muted">Bestätige kurz, wie du die App nutzt.</p></div>
              <RoleCards value={role} onChange={setRole} disabled={busy} />
              <Button full size="lg" loading={busy} onClick={confirmRole} icon={undefined}>Weiter</Button>
            </>
          )}

          {step === 1 && (
            <form onSubmit={saveName} className="space-y-5">
              <div className="text-center"><h1 className="text-title">Wie sollen dich deine Klassen nennen?</h1><p className="mt-2 text-sm text-muted">Dieser Name ist für deine Schüler:innen sichtbar, zum Beispiel „Frau Keller“.</p></div>
              <Field label="Anzeigename" htmlFor="display-name"><Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" data-autofocus /></Field>
              <Button type="submit" full size="lg" loading={busy}>Weiter <ArrowRight size={16} /></Button>
            </form>
          )}

          {step === 2 && !created && (
            <form onSubmit={makeClass} className="space-y-5">
              <div className="text-center"><h1 className="text-title">Deine erste Klasse</h1><p className="mt-2 text-sm text-muted">Danach lädst du deine Schüler:innen per Link oder Code ein. Du kannst weitere Klassen jederzeit hinzufügen.</p></div>
              <Field label="Klassenname" htmlFor="class-name"><Input id="class-name" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="z. B. Informatik 4a" maxLength={60} data-autofocus /></Field>
              <Field label="Schuljahr" htmlFor="school-year"><Input id="school-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/27" maxLength={20} /></Field>
              <Button type="submit" full size="lg" loading={busy} icon={<GraduationCap size={17} />}>Klasse erstellen</Button>
              <button type="button" onClick={() => void run(() => finish())} className="mx-auto flex min-h-11 items-center px-3 text-sm font-medium text-muted hover:underline">Später erledigen</button>
            </form>
          )}

          {step === 2 && created && (
            <div className="space-y-5 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--success-bg)] text-[var(--success-fg)]"><Check size={28} /></span>
              <div><h1 className="text-title">„{created.name}“ ist bereit</h1><p className="mt-2 text-sm text-muted">Gib diesen Code an deine Schüler:innen weiter. Sie entscheiden selbst, was sie mit dir teilen.</p></div>
              <div className="flex justify-center"><CodeActions code={created.joinCode} name={created.name} /></div>
              <Button full size="lg" loading={busy} onClick={() => void run(() => finish(`/teacher/classes/${created.id}`))}>Zur Klasse</Button>
              <button type="button" onClick={() => void run(() => finish())} className="mx-auto flex min-h-11 items-center px-3 text-sm font-medium text-muted hover:underline">Zur Übersicht</button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
