import Image from "next/image";

/** App screenshot in a window frame; swaps the light/dark image with the theme (no JS). */
export function Screenshot({ name, alt, width, height, priority }: { name: string; alt: string; width: number; height: number; priority?: boolean }) {
  const cls = "h-auto w-full";
  return (
    <figure className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--solid)] shadow-[var(--shadow-lg)]">
      <div className="flex gap-1.5 border-b border-[var(--line)] px-3.5 py-2.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-[var(--line)]" /><i className="h-2.5 w-2.5 rounded-full bg-[var(--line)]" /><i className="h-2.5 w-2.5 rounded-full bg-[var(--line)]" /></div>
      <Image src={`/landing/${name}-light.webp`} alt={alt} width={width} height={height} priority={priority} sizes="(min-width: 1024px) 560px, 100vw" className={`${cls} [[data-theme=dark]_&]:hidden`} />
      <Image src={`/landing/${name}-dark.webp`} alt="" aria-hidden width={width} height={height} sizes="(min-width: 1024px) 560px, 100vw" className={`${cls} hidden [[data-theme=dark]_&]:block`} />
    </figure>
  );
}
