import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn("min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm text-[#1d1d1f] outline-none transition placeholder:text-[#737378] focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15", className)} {...props} />; }
