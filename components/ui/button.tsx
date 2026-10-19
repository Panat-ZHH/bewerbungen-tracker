import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#0866d6] text-white hover:bg-[#075bbb]",
  secondary: "border border-white/80 bg-white/55 text-[#1d1d1f] backdrop-blur-xl hover:bg-white/75",
  ghost: "text-[#5e5e63] hover:bg-[#f2f2f4] hover:text-[#1d1d1f]",
  danger: "border border-[#e8c7c7] bg-[#fff8f8] text-[#b42323] hover:bg-[#fff0f0]",
};

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50", variants[variant], className)} {...props} />;
}
