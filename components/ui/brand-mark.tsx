import Image from "next/image";

/**
 * WendApply logo. Light mode: glyph on a light tile. Dark mode: tile-less variant (light glyph on transparent),
 * so there is no dark box/edge. `fixedTile` keeps a white tile in both themes (for use on the blue brand gradient).
 */
export function BrandMark({ size = 36, radius = 11, pad = 0, white = false, fixedTile = false, className = "", priority = false }: { size?: number; radius?: number; pad?: number; white?: boolean; fixedTile?: boolean; className?: string; priority?: boolean }) {
  return (
    <span className={`brand-mark ${fixedTile ? "brand-mark-fixed brand-mark-raised" : ""} ${className}`} style={{ width: size, height: size, borderRadius: radius, "--bm-pad": `${pad}px`, "--bm-bg": white || fixedTile ? "#fff" : undefined } as React.CSSProperties} aria-hidden>
      <Image src="/logo.png" alt="" width={size} height={size} className="brand-mark-light" priority={priority} />
      {!fixedTile && <Image src="/logo-dark.png" alt="" width={size} height={size} className="brand-mark-dark" priority={priority} />}
    </span>
  );
}
