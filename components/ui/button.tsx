import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "sun" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// Sticker buttons: flat fill, ink contour, hard shadow. `pressable` makes them sink on press (shadow gone, 2px down).
const sticker = "border-[length:var(--border-w)] shadow-[var(--shadow-sm)] pressable";
const variants: Record<ButtonVariant, string> = {
  primary: cn(sticker, "border-[var(--outline-fill)] bg-[var(--brand)] text-[var(--on-brand)]"),
  sun: cn(sticker, "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]"),
  secondary: cn(sticker, "border-[var(--outline)] bg-[var(--surface)] text-[var(--ink)]"),
  ghost: "text-[var(--ink)] underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:bg-[var(--hover)] hover:decoration-[var(--ink)] active:translate-y-px",
  danger: "border-[length:var(--border-w)] border-[var(--danger-fg)] bg-[var(--danger-bg)] text-[var(--danger-fg)] transition-transform hover:brightness-95 active:translate-y-px",
};
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-[13px] pointer-coarse:min-h-11",
  md: "min-h-11 px-5 text-sm sm:min-h-10 sm:px-4 pointer-coarse:min-h-11",
  lg: "min-h-12 px-6 text-base",
};

export function buttonClasses({ variant = "primary", size = "md", full, className }: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string }) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-none whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none",
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
