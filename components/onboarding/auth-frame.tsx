import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { cn } from "@/lib/utils";

/** Logo + wordmark, straight on paper (no tile). */
export function AuthBrand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={36} priority />
      <span className="font-display text-xl font-extrabold tracking-[-.03em]">WendApply</span>
    </div>
  );
}

/** Paper frame for the small screens around sign-in (role picker, onboarding, reset, callback): logo on top, content in a narrow column. */
export function AuthFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col px-4 pb-10 sm:px-6">
      <div className={cn("mx-auto w-full max-w-[520px]", className)}>
        <AuthBrand className="h-16" />
      </div>
      <div className={cn("animate-rise mx-auto my-auto w-full max-w-[520px] py-4 sm:py-8", className)}>{children}</div>
    </main>
  );
}

/** One loud title + a calm line, left-aligned above the sticker panel. */
export function AuthTitle({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-title">{title}</h1>
      {children && <p className="mt-2 max-w-md text-body text-muted">{children}</p>}
    </div>
  );
}

/** Progress as numbered stickers: done = mint, current = yellow, later = dashed. */
export function AuthSteps({ steps, current, allDone, children }: { steps: string[]; current: number; allDone?: boolean; children: (state: "done" | "current" | "todo", index: number) => ReactNode }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Fortschritt">
      {steps.map((label, i) => {
        const state = i < current || allDone ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} aria-current={i === current ? "step" : undefined} className="flex items-center gap-2">
            <span className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-full border-[length:var(--border-w)] px-2 text-[13px] font-bold tabular",
              state === "done" && "border-[var(--outline-fill)] bg-[var(--mint)] text-[var(--on-mint)]",
              state === "current" && "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-sm)]",
              state === "todo" && "border-dashed border-[var(--outline)] text-muted",
            )}>{children(state, i)}</span>
            <span className={cn("text-small", i === current ? "font-semibold" : "hidden text-muted sm:inline")}>{label}</span>
            {i < steps.length - 1 && <span aria-hidden className="w-4 border-t-2 border-dashed border-[var(--line)] sm:w-5" />}
          </li>
        );
      })}
    </ol>
  );
}
