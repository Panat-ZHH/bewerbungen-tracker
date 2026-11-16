import Image, { getImageProps } from "next/image";
import { preload } from "react-dom";

const SIZES = "(min-width: 1024px) 560px, 100vw";

/** App screenshot in a window frame; swaps the light/dark image with the theme (no JS).
 * priority (hero/LCP): the light image loads eagerly with high fetch priority; the dark one stays lazy (display:none images are
 * not fetched by light-theme visitors) but gets high priority once dark mode shows it. For visitors whose system is dark, the
 * dark hero is preloaded via <link rel=preload media="(prefers-color-scheme: dark)"> so it is not delayed as a lazy LCP image.
 * Everything else loads lazily. */
export function Screenshot({ name, alt, width, height, priority, className = "" }: { name: string; alt: string; width: number; height: number; priority?: boolean; className?: string }) {
  const cls = "h-auto w-full";
  if (priority) {
    const { props } = getImageProps({ src: `/landing/${name}-dark.webp`, alt: "", width, height, sizes: SIZES });
    if (props.srcSet) preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: SIZES, fetchPriority: "high", media: "(prefers-color-scheme: dark)" });
  }
  return (
    <figure className={`m-0 overflow-hidden rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] shadow-[var(--shadow-lg)] ${className}`}>
      <div className="flex gap-1.5 border-b-[length:var(--border-w)] border-[var(--outline)] px-3.5 py-2.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-[var(--coral)]" /><i className="h-2.5 w-2.5 rounded-full bg-[var(--sun)]" /><i className="h-2.5 w-2.5 rounded-full bg-[var(--mint)]" /></div>
      <Image src={`/landing/${name}-light.webp`} alt={alt} width={width} height={height} loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} sizes={SIZES} className={`${cls} [[data-theme=dark]_&]:hidden`} />
      <Image src={`/landing/${name}-dark.webp`} alt="" aria-hidden width={width} height={height} loading="lazy" {...(priority ? { fetchPriority: "high" as const } : {})} sizes={SIZES} className={`${cls} hidden [[data-theme=dark]_&]:block`} />
    </figure>
  );
}
