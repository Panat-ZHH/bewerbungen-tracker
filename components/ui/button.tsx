import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "text-white bg-[image:var(--brand-gradient)] shadow-[var(--shadow-brand)] hover:brightness-110 hover:-translate-y-px",
  secondary: "border border-[var(--glass-border)] bg-[var(--raised)] text-[var(--ink)] shadow-[var(--shadow-xs)] backdrop-blur-xl hover:bg-[var(--raised-hover)] hover:shadow-[var(--shadow-sm)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
  danger: "border border-[var(--danger-line)] bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:brightness-95",
};
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-[13px] pointer-coarse:min-h-11",
  md: "min-h-11 px-5 text-sm sm:min-h-10 sm:px-4 pointer-coarse:min-h-11",
  lg: "min-h-12 px-6 text-[15px]",
};

export function buttonClasses({ variant = "primary", size = "md", full, className }: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string }) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-none whitespace-nowrap select-none transition duration-200 ease-out active:translate-y-0 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none",
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
