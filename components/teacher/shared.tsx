"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return <div role="alert" className="status status-danger flex items-center justify-between gap-3 rounded-[var(--radius-md)] p-3 text-sm"><span>{message}</span>{onRetry && <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={onRetry}>Erneut laden</Button>}</div>;
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
