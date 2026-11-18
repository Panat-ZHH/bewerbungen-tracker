import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

/**
 * Button-styled link to /login for the public pages. Not prefetched when it scrolls into view (only on hover / touch):
 * the login route pulls in the Supabase client (~100 KB), which would otherwise load with every marketing page and
 * compete with the first paint on phones.
 */
export function LoginLink({ href = "/login", variant = "primary", size = "md", full, icon, className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string; variant?: ButtonVariant; size?: ButtonSize; full?: boolean; icon?: ReactNode }) {
  return <Link href={href} prefetch={false} className={buttonClasses({ variant, size, full, className })} {...props}>{icon}{children}</Link>;
}
