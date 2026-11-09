"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { classErrorCode, classInviteLink } from "@/lib/classes";
import { statusLabels } from "@/lib/utils";
import { STATUS_ORDER } from "@/lib/status";
import { generalCause } from "@/lib/ux";
import type { ApplicationStatus, StatusCounts } from "@/types";

export { STATUS_ORDER } from "@/lib/status";
export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "#a7a9b2", preparing: "#c7a14a", applied: "#4a90e2", schnupper_planned: "#e0a458", schnupper_done: "#3bb0a6", aptitude_test: "#8aa4d6", interview: "#7a6be0", final_interview: "#5b4bc4", offer: "#2f9e62", contract_signed: "#1f7a49", rejected: "#d65a5a", withdrawn: "#c9c9d0",
};

export function errorMessage(reason: unknown): string {
  switch (classErrorCode(reason)) {
    case "AUTH_REQUIRED": return "Bitte melde dich erneut an.";
    case "FORBIDDEN": return "Dafür hast du keine Berechtigung.";
    case "CLASS_NOT_FOUND": return "Diesen Klassencode gibt es nicht. Prüfe die Schreibweise.";
    case "NOT_FOUND": return "Der Eintrag wurde nicht gefunden.";
    case "INVALID_NAME": return "Bitte gib einen gültigen Namen ein.";
    case "INVALID_REQUEST": return "Die Anfrage ist ungültig.";
    case "EXPIRED": return "Diese Einladung ist abgelaufen. Frag deine Lehrperson nach einem neuen Link.";
    case "REVOKED": return "Diese Einladung wurde zurückgezogen. Frag deine Lehrperson nach einem neuen Link.";
    case "USED_UP": return "Diese Einladung wurde schon zu oft benutzt. Frag deine Lehrperson nach einem neuen Link.";
    case "INVALID": return "Dieser Einladungslink ist nicht gültig.";
    case "RATE_LIMITED": return "Bitte warte einen Moment, bevor du es erneut versuchst.";
    default: return generalCause(reason) ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  }
}

export function formatDate(value?: string) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const HATCHED: ApplicationStatus[] = ["rejected", "withdrawn"];
/** Stacked status bar. Segments are separated by a thin gap and closed statuses are hatched, so it never relies on colour alone. `legend` adds a text key. */
export function StatusBar({ counts, total, legend = false }: { counts: StatusCounts; total: number; legend?: boolean }) {
  if (!total) return <div className="h-2 w-full rounded-full bg-[var(--neutral-bg)]" aria-label="Keine Bewerbungen" />;
  const present = STATUS_ORDER.filter((s) => counts[s]);
  const summary = present.map((s) => `${statusLabels[s]}: ${counts[s]}`).join(", ");
  const fill = (s: ApplicationStatus) => HATCHED.includes(s) ? `repeating-linear-gradient(45deg, ${STATUS_COLORS[s]} 0 3px, rgba(255,255,255,.55) 3px 5px)` : STATUS_COLORS[s];
  return (
    <div>
      <div role="img" aria-label={summary} title={summary} className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-[var(--neutral-bg)]">
        {present.map((s) => <span key={s} style={{ width: `${((counts[s] ?? 0) / total) * 100}%`, background: fill(s) }} />)}
      </div>
      {legend && (
        <ul aria-hidden className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {present.map((s) => <li key={s} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: fill(s) }} />{statusLabels[s]} {counts[s]}</li>)}
        </ul>
      )}
    </div>
  );
}

export function CodeActions({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }
  async function share() {
    const text = `Tritt meiner Klasse "${name}" in WendApply bei. Code: ${code}`;
    const url = classInviteLink(code);
    if (typeof navigator !== "undefined" && "share" in navigator) { try { await navigator.share({ title: "WendApply Klassencode", text, url }); } catch { /* cancelled */ } return; }
    await copy();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="tabular break-all rounded-[var(--radius-md)] border border-[var(--neutral-line)] bg-[var(--neutral-bg)] px-3 py-1.5 text-[15px] font-semibold tracking-[.18em]">{code}</code>
      <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />}>{copied ? "Kopiert" : "Kopieren"}</Button>
      <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" onClick={share} icon={<Share2 size={14} />}>Teilen</Button>
    </div>
  );
}
