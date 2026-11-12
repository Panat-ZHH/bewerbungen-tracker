import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Sticker surface (ink contour + hard shadow). `flat` drops the shadow for quieter groups. Never nest a Card in a Card: use `.inset` or `.rows` inside. */
export function Card({ className, interactive, flat, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; flat?: boolean }) {
  return <div className={cn(flat ? "panel-flat" : "panel", interactive && "card-interactive", className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("border-b-[length:var(--border-w)] border-dashed border-[var(--line)] p-4 sm:p-5 md:p-6", className)} {...props} />; }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-4 sm:p-5 md:p-6", className)} {...props} />; }
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn("text-heading", className)} {...props} />; }
