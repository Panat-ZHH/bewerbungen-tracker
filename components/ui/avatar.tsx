import { cn } from "@/lib/utils";

const sizes = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" } as const;
const palette = ["#0a72ee", "#6a5ae0", "#0d9488", "#d9480f", "#c2255c", "#2f9e44", "#7048e8", "#1971c2"];

export function initialsOf(name?: string | null) {
  const parts = (name ?? "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Initials avatar. Color is derived deterministically from `name`. Optional `src` image. */
export function Avatar({ name, src, size = "md", className }: { name?: string | null; src?: string | null; size?: keyof typeof sizes; className?: string }) {
  const seed = [...(name ?? "?")].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const color = palette[seed % palette.length];
  return (
    <span
      role="img"
      aria-label={name ?? "Profil"}
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-[var(--shadow-xs)] ring-2 ring-white/80", sizes[size], className)}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : initialsOf(name)}
    </span>
  );
}
