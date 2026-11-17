import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "sun" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Calm hierarchy (docs/design-system.md):
 * - primary / sun = THE main action of a screen (one per screen): level-2 sticker, 2px ink contour + hard shadow, sinks on press.
 * - secondary = calm: thin contour, no shadow (inside the app; public pages keep their sticker look via the legacy tokens).
 * - ghost = underlined text button; danger = calm red tint for destructive actions.
 */
const strong = "btn-strong pressable border-[length:var(--border-strong)] border-[var(--outline-fill)] shadow-[var(--elev-2-sm)]";
const variants: Record<ButtonVariant, string> = {
  primary: cn(strong, "bg-[var(--brand)] text-[var(--on-brand)]"),
  sun: cn(strong, "bg-[var(--sun)] text-[var(--on-sun)]"),
  secondary: "pressable border-[length:var(--border-w)] border-[var(--control-edge)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--ink)] underline decoration-[var(--line)] decoration-2 underline-offset-4 transition-colors hover:bg-[var(--hover)] hover:decoration-[var(--ink)] active:translate-y-px",
  danger: "border-[length:var(--border-w)] border-[var(--danger-line)] bg-[var(--danger-bg)] text-[var(--danger-fg)] transition-[transform,filter] hover:brightness-95 active:translate-y-px",
};
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-[13px] pointer-coarse:min-h-11",
  md: "min-h-11 px-5 text-sm sm:px-4",
  lg: "min-h-12 px-6 text-base",
};

export function buttonClasses({ variant = "primary", size = "md", full, className }: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string }) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-none whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-busy:opacity-80",
    variants[variant], sizes[size], full && "w-full", className,
  );
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; loading?: boolean; icon?: ReactNode };

export function Button({ className, variant = "primary", size = "md", full, loading, icon, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & Common) {
  return (
    <button disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses({ variant, size, full, className })} {...props}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Link styled like a Button. */
export function ButtonLink({ className, variant = "primary", size = "md", full, icon, children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & Common & { href: string }) {
  return <Link href={href} className={buttonClasses({ variant, size, full, className })} {...props}>{icon}{children}</Link>;
}
