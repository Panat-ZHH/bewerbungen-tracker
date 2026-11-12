import Image from "next/image";

/**
 * WendApply logo: black "W" with the blue dot. By default it sits straight on the page (light glyph variant in dark mode).
 * `fixedTile` / `white` put it on a white sticker tile with ink contour (same in both themes).
 */
export function BrandMark({ size = 36, radius = 10, pad = 0, white = false, fixedTile = false, className = "", priority = false }: { size?: number; radius?: number; pad?: number; white?: boolean; fixedTile?: boolean; className?: string; priority?: boolean }) {
  const tile = white || fixedTile;
  return (
    <span className={`brand-mark ${tile ? "brand-mark-tile" : ""} ${className}`} style={{ width: size, height: size, borderRadius: tile ? radius : 0, "--bm-pad": `${pad}px` } as React.CSSProperties} aria-hidden>
      <Image src="/logo.png" alt="" width={size} height={size} className="brand-mark-light" priority={priority} />
      {!tile && <Image src="/logo-dark.png" alt="" width={size} height={size} className="brand-mark-dark" priority={priority} />}
    </span>
  );
}
