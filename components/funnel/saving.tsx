"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/skeleton";
import { resolveLanding } from "@/lib/role";
import { toast } from "@/lib/toast";
import type { ApplyOutcome, FunnelStateV1 } from "@/lib/funnel/types";
import { applyPending, clearConfirmRecord } from "./store";

export const ALREADY_ACCOUNT_TOAST = "Du hast schon ein Konto. Wir haben dich angemeldet.";

export type SavePhase = "idle" | "saving" | "error";

/** Where to go after the save: the save's own redirect (class code, family step, invite) or the role landing. Never back into the funnel. */
async function landingAfter(outcome: ApplyOutcome, next: string | null): Promise<string> {
  if (outcome.status === "applied" && outcome.redirect) return outcome.redirect;
  const path = await resolveLanding(next).catch(() => "/dashboard");
  return path.startsWith("/start") ? "/dashboard" : path;
}

/**
 * Saves the funnel answers right after a session exists (SPEC-FLOW §4.7, SPEC-DATA §3.1 step 6) and navigates on.
 * `announceExisting`: show «Du hast schon ein Konto …» when the answers were not applied to an older account (Google path).
 */
export function useFunnelSave(next: string | null, opts: { announceExisting?: boolean } = {}) {
  const router = useRouter();
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [errorKind, setErrorKind] = useState<Extract<ApplyOutcome, { status: "error" }>["kind"] | null>(null);
  const running = useRef(false);
  const announce = opts.announceExisting ?? true;

  const save = useCallback(async (opts: { skipped?: boolean; role?: FunnelStateV1["role"] } = {}) => {
    if (running.current) return;
    running.current = true;
    setPhase("saving"); setErrorKind(null);
    const outcome = await applyPending(opts);
    if (outcome.status === "error") { running.current = false; setErrorKind(outcome.kind); setPhase("error"); return; }
    clearConfirmRecord();
    const mismatch = outcome.status === "applied" && outcome.result.role_mismatch;
    const existing = outcome.status === "skipped" && (outcome.result.reason === "already_done" || outcome.result.reason === "not_new");
    if (mismatch || (announce && existing)) toast({ message: ALREADY_ACCOUNT_TOAST, tone: "info" });
    router.replace(await landingAfter(outcome, next));
  }, [announce, next, router]);

  /** «Ohne Plan weiter»: keeps the local copy (retried on the next app start) and opens the app. */
  const skip = useCallback(async () => {
    setPhase("saving");
    const path = await resolveLanding(next).catch(() => "/dashboard");
    router.replace(path.startsWith("/start") ? "/dashboard" : path);
  }, [next, router]);

  return { phase, errorKind, save, skip };
}

/** Full-screen status while saving, error with retry. */
export function SavingView({ phase, errorKind, onRetry, onSkip, label = "Dein Plan wird gespeichert …" }: { phase: SavePhase; errorKind: string | null; onRetry: () => void | Promise<void>; onSkip: () => void; label?: string }) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (phase === "error") headingRef.current?.focus(); }, [phase]);
  if (phase === "error") {
    return (
      <div className="panel space-y-4 p-5 sm:p-7" data-testid="funnel-save-error">
        <p ref={headingRef} tabIndex={-1} className="text-heading outline-none">Dein Plan konnte nicht gespeichert werden.</p>
        <StatusMessage tone="danger">{errorKind === "rate_limit" ? "Zu viele Versuche. Warte eine Minute und versuch es dann noch einmal." : errorKind === "network" ? "Keine Verbindung. Prüf dein Netz und versuch es noch einmal." : "Versuch es noch einmal."}</StatusMessage>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={onRetry} data-testid="funnel-save-retry">Nochmals versuchen</Button>
          <Button size="lg" variant="secondary" onClick={onSkip} data-testid="funnel-save-skip">Ohne Plan weiter</Button>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-center gap-3" data-testid="funnel-saving">
      <span aria-hidden className="spinner h-5 w-5 shrink-0 text-[var(--brand)]" />
      <span className="font-display text-2xl font-extrabold tracking-[-.02em]">{label}</span>
    </div>
  );
}
