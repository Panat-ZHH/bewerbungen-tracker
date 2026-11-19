"use client";

import Link from "next/link";
import { forwardRef, useId, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./funnel.module.css";

/** Top bar of every question screen: «Zurück» (hidden on screen 0), progress, quiet «Anmelden» (last in DOM order). */
export function FunnelTopBar({ onBack, progress, loginHref, showLogo }: { onBack?: (() => void) | null; progress?: { index: number; total: number } | null; loginHref: string | null; showLogo?: boolean }) {
  return (
    <header className="flex min-h-14 items-center gap-3">
      {showLogo ? (
        <Link href="/" className="flex min-h-11 items-center gap-2 rounded-full pr-2" aria-label="WendApply Startseite">
          <BrandMark size={32} priority />
          <span className="font-display text-lg font-extrabold tracking-[-.03em] max-[359px]:hidden">WendApply</span>
        </Link>
      ) : onBack ? (
        <button type="button" onClick={onBack} data-testid="funnel-back" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--hover)]">
          <ArrowLeft size={18} strokeWidth={2.4} aria-hidden />Zurück
        </button>
      ) : <span className="w-2" />}
      <div className="min-w-0 flex-1">{progress && <ProgressBar index={progress.index} total={progress.total} />}</div>
      {loginHref && <Link href={loginHref} data-testid="funnel-login" className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[var(--ink)] underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]">Anmelden</Link>}
    </header>
  );
}

/** Segments: done = ink, current = sun, rest = surface-2. Width animates only. */
export function ProgressBar({ index, total }: { index: number; total: number }) {
  return (
    <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index} aria-valuetext={`Schritt ${index} von ${total}`} aria-label="Fortschritt" data-testid="funnel-progress" className="mx-auto flex max-w-[360px] gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden className={cn("h-2 flex-1 rounded-full border border-[var(--line)]", styles.progressFill, i + 1 < index ? "bg-[var(--ink)] border-[var(--ink)]" : i + 1 === index ? "bg-[var(--sun)] border-[var(--outline-fill)]" : "bg-[var(--surface-2)]")} />
      ))}
    </div>
  );
}

/** «Schritt n von N» + H1 (focus target on every step change) + one help line. */
export const StepHeading = forwardRef<HTMLHeadingElement, { title: ReactNode; help?: ReactNode; progress?: { index: number; total: number } | null; aside?: ReactNode }>(
  function StepHeading({ title, help, progress, aside }, ref) {
    return (
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {progress && <p className="text-small text-muted" data-testid="funnel-step-count">Schritt {progress.index} von {progress.total}</p>}
          <h1 ref={ref} tabIndex={-1} className="mt-1 text-title outline-none [overflow-wrap:anywhere]">{title}</h1>
          {help && <p className="mt-2 text-body text-muted">{help}</p>}
        </div>
        {aside && <div className="hidden w-[120px] shrink-0 lg:block" aria-hidden>{aside}</div>}
      </div>
    );
  },
);

/** Sticky bottom bar on phones, static under the input from 1024 (SPEC-FLOW §2.1). */
export function ActionBar({ primary, onPrimary, primaryLoading, onBack, skip, primaryTestId = "funnel-next", primaryIcon = true, children }: {
  primary: string; onPrimary: () => void; primaryLoading?: boolean; onBack?: (() => void) | null; skip?: { label?: string; onSkip: () => void } | null;
  primaryTestId?: string; primaryIcon?: boolean; children?: ReactNode;
}) {
  return (
    <div className={styles.actionBar}>
      <div className="flex items-center gap-3">
        {onBack && <Button type="button" variant="ghost" size="lg" onClick={onBack} className="hidden lg:inline-flex" data-testid="funnel-back-desktop"><ArrowLeft size={16} strokeWidth={2.4} aria-hidden />Zurück</Button>}
        <Button type="button" size="lg" full onClick={onPrimary} loading={primaryLoading} data-testid={primaryTestId} className="min-h-[52px] lg:w-auto lg:min-w-56 lg:flex-none">
          {primaryLoading ? "Einen Moment …" : primary}{!primaryLoading && primaryIcon && <ArrowRight size={18} strokeWidth={2.4} aria-hidden />}
        </Button>
      </div>
      {skip && (
        <p className="mt-1 text-center lg:text-left">
          <button type="button" onClick={skip.onSkip} data-testid="funnel-skip" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--ink)] underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]">{skip.label ?? "Überspringen"}</button>
        </p>
      )}
      {children}
    </div>
  );
}

export type TileOption<T extends string> = { value: T; label: string; hint?: string; icon?: LucideIcon };

/** Moves the selection with arrow keys inside a radio group (the native radios do this too; tiles are labels around sr-only inputs). */
function arrowMove<T extends string>(event: KeyboardEvent, options: TileOption<T>[], value: T | null, select: (v: T) => void) {
  const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const dir = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
  const next = options[(i + dir + options.length) % options.length];
  select(next.value);
  (event.currentTarget.querySelector(`input[value="${CSS.escape(next.value)}"]`) as HTMLInputElement | null)?.focus();
}

/**
 * Big tiles as a radio group (single) or checkbox group (multi). `<fieldset>` + visually hidden legend, inputs are real
 * radios/checkboxes (keyboard: arrows / Space). `onPointerPick` fires only for pointer taps (role screen auto-advance).
 */
export function ChoiceTiles<T extends string>({ legend, options, value, onChange, multi, error, errorId, onPointerPick, columns = "auto", tall, testId, name }: {
  legend: string; options: TileOption<T>[]; value: T | T[] | null; onChange: (v: T) => void; multi?: boolean; error?: string | null; errorId?: string;
  onPointerPick?: (v: T) => void; columns?: "one" | "auto"; tall?: boolean; testId?: string; name?: string;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <fieldset data-testid={testId} aria-describedby={error && errorId ? errorId : undefined} aria-invalid={error ? true : undefined}
      onKeyDown={multi ? undefined : (e) => arrowMove(e, options, (value as T | null) ?? null, onChange)}>
      <legend className="sr-only">{legend}</legend>
      <div className={cn("grid gap-2.5", columns === "auto" && options.length >= 4 && "min-[560px]:grid-cols-2")}>
        {options.map(({ value: v, label, hint, icon: Icon }) => {
          const on = isOn(v);
          return (
            <label key={v} data-value={v} data-selected={on || undefined}
              onPointerUp={(e) => { if (onPointerPick && !multi && e.button === 0) onPointerPick(v); }}
              className={cn(
                "relative flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[length:var(--border-w)] px-4 py-3 focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] active:translate-y-px",
                styles.tile, tall ? "min-h-[88px]" : "min-h-16",
                on ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--field-border)] bg-[var(--field-bg)] hover:bg-[var(--surface-2)]",
                error && !on && "border-[var(--danger-fg)]",
              )}>
              <input type={multi ? "checkbox" : "radio"} name={groupName} value={v} checked={on} onChange={() => onChange(v)} className="sr-only" />
              {Icon && <Icon size={tall ? 24 : 20} strokeWidth={2.2} aria-hidden className="shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-tight">{label}</span>
                {hint && <span className={cn("mt-0.5 block text-small", on ? "" : "text-muted")}>{hint}</span>}
              </span>
              <span aria-hidden className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)]", on ? "border-[var(--outline-fill)] bg-[var(--surface)] text-[var(--ink)]" : "border-[var(--field-border)]")}>
                {on && <Check size={14} strokeWidth={3} className={styles.check} />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Small chips as a radio group (birth years, start years, weekly goal). */
export function ChipGroup<T extends string | number>({ label, options, value, onChange, render, error, errorId, testId, className, chipClassName }: {
  label: string; options: T[]; value: T | null; onChange: (v: T) => void; render?: (v: T) => ReactNode; error?: string | null; errorId?: string;
  testId?: string; className?: string; chipClassName?: string;
}) {
  const name = useId();
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const i = Math.max(0, options.findIndex((o) => o === value));
    const dir = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const next = options[(i + dir + options.length) % options.length];
    onChange(next);
    (event.currentTarget.querySelector(`input[value="${CSS.escape(String(next))}"]`) as HTMLInputElement | null)?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} aria-describedby={error && errorId ? errorId : undefined} aria-invalid={error ? true : undefined} data-testid={testId} onKeyDown={onKey} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o === value;
        return (
          <label key={String(o)} data-value={String(o)} data-selected={on || undefined} className={cn(
            "relative inline-flex min-h-12 min-w-[64px] cursor-pointer items-center justify-center rounded-full border-[length:var(--border-w)] px-4 text-base font-bold tabular focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] active:translate-y-px",
            styles.tile,
            on ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]" : "border-[var(--field-border)] bg-[var(--field-bg)] hover:bg-[var(--surface-2)]",
            chipClassName,
          )}>
            <input type="radio" name={name} value={String(o)} checked={on} onChange={() => onChange(o)} className="sr-only" />
            {render ? render(o) : String(o)}
          </label>
        );
      })}
    </div>
  );
}

/** Inline field error with icon (R-4.4). */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-small font-medium text-[var(--danger-fg)]"><span aria-hidden className="mt-[3px] inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current text-center text-[9px] font-black leading-[10px]">!</span>{children}</p>;
}

/** Info note (role="note"). */
export function InfoNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p role="note" data-testid={testId} className="rounded-[var(--radius-md)] bg-[var(--info-bg)] px-3 py-2.5 text-small text-[var(--info-fg)]">{children}</p>;
}

export function NextArrow() { return <ArrowRight size={18} strokeWidth={2.4} aria-hidden />; }
