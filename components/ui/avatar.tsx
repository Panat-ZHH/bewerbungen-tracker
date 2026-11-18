import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsFromName } from "@/lib/profile-name-utils";

const pixels = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 } as const;
const sizes = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" } as const;
// Soft tints of the accent family (yellow, coral, green, blue, sand) with ink text: friendly but calm in long lists. AA in both themes.
const palette = [
  "bg-[var(--sun-soft)] text-[var(--ink)]",
  "bg-[var(--coral-soft)] text-[var(--ink)]",
  "bg-[var(--mint-soft)] text-[var(--ink)]",
  "bg-[var(--brand-soft)] text-[var(--ink)]",
  "bg-[var(--sand)] text-[var(--ink)]",
];

export function initialsOf(name?: string | null) {
  return initialsFromName(name);
}

/** Shared avatar: profile picture when `src` loads, otherwise initials on a flat colour derived from `name`. */
export function Avatar({ name, src, size = "md", className }: { name?: string | null; src?: string | null; size?: keyof typeof sizes; className?: string }) {
  const seed = [...(name ?? "?")].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = Boolean(src) && failedSrc !== src;
  const initials = initialsOf(name);
  return (
    <span
      role="img"
      aria-label={name ?? "Profil"}
      className={cn("font-display inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border-[length:var(--border-w)] border-[var(--outline)] font-bold", palette[seed % palette.length], sizes[size], className)}
    >
      {showImage ? (
        // Plain <img>: avatars come from a user-controlled public bucket with changing ?v= URLs, next/image would add nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" width={pixels[size]} height={pixels[size]} loading="lazy" decoding="async" onError={() => setFailedSrc(src!)} className="h-full w-full object-cover" />
      ) : initials === "?" ? (
        // No name yet: a neutral person icon, not a «?» that reads like a help button (AUDIT-B P2).
        <UserRound aria-hidden className="h-[60%] w-[60%]" strokeWidth={2} />
      ) : initials}
    </span>
  );
}
