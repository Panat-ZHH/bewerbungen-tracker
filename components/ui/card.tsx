import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, interactive, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cn("panel", interactive && "card-interactive", className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("border-b border-[var(--line)] p-4 sm:p-5 md:p-6", className)} {...props} />; }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-4 sm:p-5 md:p-6", className)} {...props} />; }
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn("text-heading", className)} {...props} />; }
