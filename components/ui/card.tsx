import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "surface" | "primary" | "inset";

const variants: Record<CardVariant, string> = {
  /** Level 1, the default: calm surface with a soft 1px edge, no shadow (inside the app). */
  surface: "panel",
  /** Level 2: THE primary sticker of a screen (at most one): 2px ink contour + hard shadow. */
  primary: "panel-primary",
  /** Level 0: tinted block without border, for groups inside a surface. */
  inset: "inset",
};

/**
 * Surface. `variant`: surface (default, calm) | primary (sticker, one per screen) | inset. `flat` is kept for old call sites (= surface).
 * Never nest a Card in a Card: use `.inset` or `.rows` inside.
 */
export function Card({ className, interactive, flat, variant = "surface", ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; flat?: boolean; variant?: CardVariant }) {
  return <div className={cn(flat && variant === "surface" ? "panel-flat" : variants[variant], interactive && "card-interactive", className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("border-b-[length:var(--border-w)] border-[var(--line)] p-4 sm:p-5 md:p-6", className)} {...props} />; }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-4 sm:p-5 md:p-6", className)} {...props} />; }
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn("text-heading", className)} {...props} />; }
