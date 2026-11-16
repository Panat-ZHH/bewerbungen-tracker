"use client";

import { AlertTriangle, Check, CheckCircle2, ChevronDown } from "lucide-react";
import { FAMILY_COPY, fill } from "@/lib/family-copy";
import type { ParentAction, StepId, StepState } from "./parent-steps";

export type StepperItem = { id: StepId; state: StepState; title: string; line: string };

const DOT: Record<StepState, string> = {
  done: "border-[var(--success-fg)] bg-[var(--success-fg)] text-[var(--surface)]",
  current: "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]",
  attention: "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]",
  todo: "border-[var(--line)] bg-[var(--surface)] text-muted",
};
const STATE_SR: Record<StepState, string> = { done: "erledigt", current: "aktueller Schritt", attention: "braucht deine Aufmerksamkeit", todo: "noch offen" };

/**
 * Progress through the parent setup: vertical list on mobile, horizontal row from `sm`. Only shows where you are; the content
 * of the current step (with the single primary button) is rendered by the page. All steps done: one expandable line.
 */
export function FamilyStepper({ items, action }: { items: StepperItem[]; action: ParentAction }) {
  const total = items.length;
  const currentIndex = items.findIndex((s) => s.state === "current" || s.state === "attention");
  const allDone = items.every((s) => s.state === "done");
  const list = (
    <ol className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr sm:gap-4">
      {items.map((s, i) => (
        <li key={s.id} data-step={s.id} data-state={s.state} aria-current={s.state === "current" || s.state === "attention" ? "step" : undefined}
          className={`flex min-w-0 items-start gap-3 rounded-[var(--radius-lg)] border-[length:var(--border-w)] p-3 ${s.state === "current" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : s.state === "attention" ? "border-[var(--sun)] bg-[var(--surface)]" : "border-[var(--line)] bg-[var(--surface)]"}`}>
          <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold ${DOT[s.state]}`}>
            {s.state === "done" ? <Check size={16} strokeWidth={3} /> : s.state === "attention" ? <AlertTriangle size={15} strokeWidth={2.6} /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{s.title}<span className="sr-only">, {STATE_SR[s.state]}</span></span>
            <span className={`block text-small ${s.state === "todo" ? "text-muted" : ""}`}>{s.line}</span>
          </span>
        </li>
      ))}
    </ol>
  );
  return (
    <nav aria-label={FAMILY_COPY.stepper.aria.replace("3", String(total))} data-testid="family-stepper" data-next-action={action} className="space-y-2">
      {allDone ? (
        <details className="group panel-flat px-4 py-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
            <CheckCircle2 size={18} aria-hidden className="text-[var(--success-fg)]" />{FAMILY_COPY.stepper.allDone}
            <ChevronDown size={16} aria-hidden className="ml-auto transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3">{list}</div>
        </details>
      ) : (
        <>
          <p className="text-small font-semibold text-muted">{fill(FAMILY_COPY.stepper.progress, { n: currentIndex + 1, total })}</p>
          {list}
        </>
      )}
    </nav>
  );
}
