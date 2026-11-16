import Image from "next/image";

/** Screenshot in the app's sticker frame (priority = hero/LCP: light eager + high fetch priority, dark lazy + high priority so light-theme visitors never fetch it). Light image always; an optional dark variant swaps in with data-theme="dark" (no JS). */
export function GuideShot({ src, darkSrc, alt, width, height, caption, priority, className = "" }: { priority?: boolean; src: string; darkSrc?: string; alt: string; width: number; height: number; caption?: string; className?: string }) {
  const cls = "h-auto w-full";
  return (
    <figure className={`m-0 ${className}`}>
      <div className="overflow-hidden rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <Image src={src} alt={alt} width={width} height={height} {...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : { loading: "lazy" as const })} sizes={priority ? "(min-width: 1024px) 560px, 100vw" : "(min-width: 1024px) 720px, 100vw"} className={darkSrc ? `${cls} [[data-theme=dark]_&]:hidden` : cls} />
        {darkSrc && <Image src={darkSrc} alt="" aria-hidden width={width} height={height} loading="lazy" {...(priority ? { fetchPriority: "high" as const } : {})} sizes={priority ? "(min-width: 1024px) 560px, 100vw" : "(min-width: 1024px) 720px, 100vw"} className={`${cls} hidden [[data-theme=dark]_&]:block`} />}
      </div>
      {caption && <figcaption className="text-small mt-2.5 text-muted">{caption}</figcaption>}
    </figure>
  );
}
