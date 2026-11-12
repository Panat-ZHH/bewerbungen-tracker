import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Ink contour; focus = brand contour + hard brand shadow (no soft ring).
export const fieldClasses =
  "min-h-11 w-full rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--field-border)] bg-[var(--field-bg)] px-3.5 py-2.5 text-base text-[var(--ink)] outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-[var(--placeholder)] focus:border-[var(--brand)] focus:shadow-[3px_3px_0_var(--brand)] disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-fg)] pointer-fine:text-sm";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(fieldClasses, className)} {...props} />; }

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn(fieldClasses, "min-h-24 resize-y leading-6", className)} {...props} />; }

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, "select-caret", className)} {...props}>{children}</select>;
}

/** Label + control + hint/error wrapper. Pass `htmlFor` matching the control id. */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {children}
      {error ? <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">{error}</p> : hint ? <p className="text-small text-muted">{hint}</p> : null}
    </div>
  );
}
