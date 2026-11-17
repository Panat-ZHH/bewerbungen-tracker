import { cloneElement, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Contour in --field-border (>= 3:1 in both themes); focus = brand contour + --field-focus-shadow (a 1px brand ring inside the app,
// the hard brand shadow on public pages). Error = red contour. 44px tall.
export const fieldClasses =
  "min-h-11 w-full rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--field-border)] bg-[var(--field-bg)] px-3.5 py-2.5 text-base text-[var(--ink)] outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-[var(--placeholder)] focus:border-[var(--brand)] focus:shadow-[var(--field-focus-shadow)] disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-fg)] aria-[invalid=true]:focus:shadow-[0_0_0_1px_var(--danger-fg)] pointer-fine:text-sm";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(fieldClasses, className)} {...props} />; }

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn(fieldClasses, "min-h-24 resize-y leading-6", className)} {...props} />; }

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, "select-caret", className)} {...props}>{children}</select>;
}

/**
 * Label + control + hint/error. Pass `htmlFor` matching the control id: the hint/error then get ids (`<id>-hint`, `<id>-error`)
 * and a single child control receives `aria-describedby` (and `aria-invalid` on error) automatically.
 */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  const messageId = htmlFor ? `${htmlFor}-${error ? "error" : "hint"}` : undefined;
  const hasMessage = Boolean(error || hint);
  let control = children;
  if (htmlFor && hasMessage && isValidElement(children)) {
    const child = children as ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" }>;
    const own = child.props["aria-describedby"];
    control = cloneElement(child, {
      "aria-describedby": own ? `${own} ${messageId}` : messageId,
      ...(error && child.props["aria-invalid"] === undefined ? { "aria-invalid": true } : {}),
    });
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {control}
      {error ? <p id={messageId} role="alert" className="text-small font-medium text-[var(--danger-fg)]">{error}</p> : hint ? <p id={messageId} className="text-small text-muted">{hint}</p> : null}
    </div>
  );
}
