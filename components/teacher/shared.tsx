"use client";

import { useEffect, useState } from "react";
import { Check, Copy, SearchX } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { generalCause } from "@/lib/ux";
import { teacherErrorCode } from "./api";
import { rateLimitText } from "@/lib/rate-limit-text";

export function teacherError(reason: unknown): string {
  const limited = rateLimitText(reason); // new limiter (lower-case code); the nudge RATE_LIMITED below is a different one
  if (limited) return limited;
  switch (teacherErrorCode(reason)) {
    case "AUTH_REQUIRED": return "Bitte melde dich erneut an.";
    case "FORBIDDEN": return "Dafür hast du keine Berechtigung.";
    case "CLASS_NOT_FOUND": case "NOT_FOUND": return "Der Eintrag wurde nicht gefunden.";
    case "INVALID_NAME": return "Bitte gib einen gültigen Namen ein.";
    case "INVALID_REQUEST": return "Die Eingabe ist ungültig. Bitte prüfe sie.";
    case "EXPIRED": return "Die Einladung ist abgelaufen.";
    case "RATE_LIMITED": return "Diese Person wurde in den letzten 3 Tagen schon erinnert. Bitte warte noch etwas.";
    default: return generalCause(reason) ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  }
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="status status-danger flex items-center justify-between gap-3 text-sm"><span>{message}</span>{onRetry && <Button size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" onClick={onRetry}>Erneut laden</Button>}</div>;
}

/** Unknown or foreign class/pupil: no retry (it can't help), one way back (lehrperson-23). */
export function TeacherNotFound({ title, text }: { title: string; text: string }) {
  return <EmptyState icon={<SearchX size={26} />} title={title} description={text} action={<ButtonLink href="/teacher" variant="secondary">Zu meinen Klassen</ButtonLink>} />;
}

/** Errors where retrying cannot help (no permission, unknown id). */
export function isPermanentTeacherError(reason: unknown): boolean {
  const code = teacherErrorCode(reason);
  return code === "FORBIDDEN" || code === "CLASS_NOT_FOUND" || code === "NOT_FOUND";
}

export function CopyButton({ text, label = "Kopieren", size = "sm", variant = "secondary" }: { text: string; label?: string; size?: "sm" | "md"; variant?: "secondary" | "ghost" }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard unavailable */ } }
  return <Button type="button" size={size} variant={variant} className="min-h-11 sm:min-h-11" onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />}><span aria-live="polite">{copied ? "Kopiert" : label}</span></Button>;
}

export function relativeDays(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "Noch nie";
  const days = Math.floor((now - new Date(value).getTime()) / 864e5);
  if (days <= 0) return "Heute";
  if (days === 1) return "Gestern";
  return `vor ${days} Tagen`;
}

export type PathStage = { label: string; short?: string; value: number; fill: "brand" | "coral" | "mint" | "sun" };
const STAGE_DOT: Record<PathStage["fill"], string> = {
  brand: "bg-[var(--brand)]",
  coral: "bg-[var(--coral)]",
  mint: "bg-[var(--mint)]",
  sun: "bg-[var(--sun)]",
};

/**
 * Key numbers of a class (or of all classes): the number of students stands large on paper, the stages follow as one calm row
 * (numbers in ink, only a small coloured dot per stage – no saturated blocks, lehrperson-11). `note` is a calm line below.
 */
export function ClassPath({ label, students, studentsHint, stages, note, className }: { label: string; students: number; studentsHint?: string; stages: PathStage[]; note?: React.ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-10">
        <p className="flex shrink-0 items-end gap-3">
          <span className="num-display">{students}</span>
          <span className="pb-1">
            <span className="font-display block text-lg font-bold leading-tight"><span className="marker">Schüler:innen</span></span>
            {studentsHint && <span className="text-small mt-0.5 block text-muted">{studentsHint}</span>}
          </span>
        </p>
        <dl className="flex flex-wrap gap-x-7 gap-y-3 sm:pb-1">
          {stages.map((stage) => (
            <div key={stage.label} className="flex min-w-0 flex-col-reverse">
              <dt className="text-small inline-flex items-center gap-1.5 font-medium text-muted"><span className={cn("h-2 w-2 shrink-0 rounded-full", stage.value > 0 ? STAGE_DOT[stage.fill] : "bg-[var(--line)]")} aria-hidden />{stage.label}</dt>
              <dd className="num-big tabular">{stage.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {note && <div className="text-small flex flex-wrap items-center gap-x-2 gap-y-1.5 text-muted">{note}</div>}
    </section>
  );
}
