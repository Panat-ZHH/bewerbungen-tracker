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
// Flat token fills, same family as the status badges: open = paper/yellow, sent = blue, talk = coral, placed = green, closed = sand (never red).
export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "var(--surface)", preparing: "var(--sun)", applied: "var(--brand)", schnupper_planned: "var(--info-line)", schnupper_done: "var(--info-line)", aptitude_test: "var(--brand-soft)", interview: "var(--coral)", final_interview: "var(--coral)", offer: "var(--mint)", contract_signed: "var(--success-line)", rejected: "var(--sand)", withdrawn: "var(--sand)",
};

// Plain data table on paper: ink line under the head, dashed row dividers (shared by the class and teacher tables).
export const TABLE_HEAD = "border-b-[length:var(--border-w)] border-[var(--outline)] text-small text-muted [&_th]:font-semibold";
export const TABLE_ROW = "border-b-[1.5px] border-dashed border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]";
// Join code as a small flat label with ink contour.
export const CODE_CHIP = "tabular break-all rounded-[var(--radius-md)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--sun-soft)] px-3 py-1.5 text-[15px] font-bold tracking-[.18em] text-[var(--ink)]";

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

/** Stacked status bar: flat segments with ink dividers inside an ink contour, so it never relies on colour alone. `legend` adds a text key. */
export function StatusBar({ counts, total, legend = false }: { counts: StatusCounts; total: number; legend?: boolean }) {
  if (!total) return <div className="h-3 w-full rounded-full border-[length:var(--border-w)] border-dashed border-[var(--neutral-line)]" aria-label="Keine Bewerbungen" />;
  const present = STATUS_ORDER.filter((s) => counts[s]);
  const summary = present.map((s) => `${statusLabels[s]}: ${counts[s]}`).join(", ");
  return (
    <div>
      <div role="img" aria-label={summary} title={summary} className="flex h-3 w-full overflow-hidden rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)] [&>*+*]:border-l-[length:var(--border-w)] [&>*+*]:border-[var(--outline)]">
        {present.map((s) => <span key={s} className="min-w-1.5" style={{ width: `${((counts[s] ?? 0) / total) * 100}%`, background: STATUS_COLORS[s] }} />)}
      </div>
      {legend && (
        <ul aria-hidden className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {present.map((s) => <li key={s} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-[var(--outline)]" style={{ background: STATUS_COLORS[s] }} />{statusLabels[s]} <span className="tabular font-bold text-[var(--ink)]">{counts[s]}</span></li>)}
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
      <code className={CODE_CHIP}>{code}</code>
      <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />}>{copied ? "Kopiert" : "Kopieren"}</Button>
      <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" onClick={share} icon={<Share2 size={14} />}>Teilen</Button>
    </div>
  );
}
