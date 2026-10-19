import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center rounded-full bg-[#f2f2f4] px-2.5 py-1 text-xs font-medium text-[#4a4a4f]", className)} {...props} />; }
