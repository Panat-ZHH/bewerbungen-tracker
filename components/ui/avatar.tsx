import { useState } from "react";
import { cn } from "@/lib/utils";
import { initialsFromName } from "@/lib/profile-name-utils";

const pixels = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 } as const;
const sizes = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" } as const;
const palette = ["#0a72ee", "#6a5ae0", "#0d9488", "#d9480f", "#c2255c", "#2f9e44", "#7048e8", "#1971c2"];

export function initialsOf(name?: string | null) {
  return initialsFromName(name);
}

/** Shared avatar: profile picture when `src` loads, otherwise initials on a color derived from `name`. */
export function Avatar({ name, src, size = "md", className }: { name?: string | null; src?: string | null; size?: keyof typeof sizes; className?: string }) {
  const seed = [...(name ?? "?")].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const color = palette[seed % palette.length];
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <span
      role="img"
      aria-label={name ?? "Profil"}
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-[var(--shadow-xs)] ring-2 ring-[var(--solid)]", sizes[size], className)}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
    >
      {showImage ? (
        // Plain <img>: avatars come from a user-controlled public bucket with changing ?v= URLs, next/image would add nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" width={pixels[size]} height={pixels[size]} loading="lazy" decoding="async" onError={() => setFailedSrc(src!)} className="h-full w-full object-cover" />
      ) : initialsOf(name)}
    </span>
  );
}
