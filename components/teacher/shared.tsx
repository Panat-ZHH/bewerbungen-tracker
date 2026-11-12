"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generalCause } from "@/lib/ux";
import { teacherErrorCode } from "./api";

export function teacherError(reason: unknown): string {
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
const STAGE_FILL: Record<PathStage["fill"], string> = {
  brand: "bg-[var(--brand)] text-[var(--on-brand)]",
  coral: "bg-[var(--coral)] text-[var(--on-coral)]",
  mint: "bg-[var(--mint)] text-[var(--on-mint)]",
  sun: "bg-[var(--sun)] text-[var(--on-sun)]",
};

/**
 * Key numbers of a class (or of all classes) without KPI boxes: the number of students stands large on paper,
 * the way to the apprenticeship follows as one ticket strip. Stages with a count are coloured in. `note` is a calm line below the number.
 */
export function ClassPath({ label, students, studentsHint, stages, note, className }: { label: string; students: number; studentsHint?: string; stages: PathStage[]; note?: React.ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={cn("grid items-end gap-x-10 gap-y-5 lg:grid-cols-[auto_minmax(0,1fr)]", className)}>
      <div>
        <p className="flex items-end gap-3">
          <span className="num-display">{students}</span>
          <span className="pb-1">
            <span className="font-display block text-lg font-bold leading-tight"><span className="marker">Schüler:innen</span></span>
            {studentsHint && <span className="text-small mt-0.5 block text-muted">{studentsHint}</span>}
          </span>
        </p>
      </div>
      <dl className="ticket">
        {stages.map((stage) => (
          <div key={stage.label} className={cn("ticket-stub flex flex-col max-sm:px-1", stage.value > 0 ? STAGE_FILL[stage.fill] : "text-[var(--muted)]")}>
            <dt className="order-2 mt-1.5 truncate text-[11px] font-bold min-[400px]:text-xs sm:text-sm">{stage.short ? <><span className="sm:hidden" aria-hidden>{stage.short}</span><span className="max-sm:sr-only">{stage.label}</span></> : stage.label}</dt>
            <dd className="num-big tabular text-[2rem] sm:text-[2.75rem]">{stage.value}</dd>
          </div>
        ))}
      </dl>
      {note && <div className="text-small flex flex-wrap items-center gap-x-2 gap-y-1.5 text-muted lg:col-span-2">{note}</div>}
    </section>
  );
}
