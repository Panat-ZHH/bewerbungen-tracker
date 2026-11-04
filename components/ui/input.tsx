import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const fieldClasses =
  "min-h-11 w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-3.5 py-2.5 text-base text-[var(--ink)] shadow-[var(--shadow-xs)] outline-none transition duration-200 placeholder:text-[var(--placeholder)] hover:border-[var(--muted)] focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/15 disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-fg)] pointer-fine:text-sm";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(fieldClasses, className)} {...props} />; }

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn(fieldClasses, "min-h-24 resize-y leading-6", className)} {...props} />; }

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236e6e73%22 stroke-width=%222.2%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]", className)} {...props}>{children}</select>;
}

/** Label + control + hint/error wrapper. Pass `htmlFor` matching the control id. */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {error ? <p role="alert" className="text-small text-[var(--danger-fg)]">{error}</p> : hint ? <p className="text-small text-muted">{hint}</p> : null}
    </div>
  );
}
