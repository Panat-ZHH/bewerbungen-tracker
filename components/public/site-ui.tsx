import Link from "next/link";
import Image, { getImageProps } from "next/image";
import { preload } from "react-dom";
import type { ReactNode } from "react";
import { ArrowRight, Check, X } from "lucide-react";

/**
 * Building blocks of the public website (server components, no client JS). Styles: components/public/site.css (scoped to .site).
 * Calm and editorial: thin rules, one accent (brand blue), ink buttons, real screenshots in neutral device frames.
 */

type Variant = "primary" | "secondary" | "ghost" | "sun";
const VARIANT: Record<Variant, string> = { primary: "s-btn-primary", sun: "s-btn-primary", secondary: "s-btn-secondary", ghost: "s-btn-ghost" };
const SIZE = { sm: "s-btn-sm", md: "", lg: "s-btn-lg" } as const;

/** Link styled as a button. Same props as the app's ButtonLink so page code reads the same; looks calm on the website. */
export function ButtonLink({ href, children, variant = "primary", size = "md", full, icon, className = "", ...rest }: {
  href: string; children: ReactNode; variant?: Variant; size?: keyof typeof SIZE; full?: boolean; icon?: ReactNode; className?: string;
  "aria-label"?: string; "data-testid"?: string;
}) {
  const cls = `s-btn ${VARIANT[variant]} ${SIZE[size]} ${full ? "s-btn-full" : ""} ${className}`.replace(/\s+/g, " ").trim();
  const inner = <>{children}{icon}</>;
  if (/^(mailto:|https?:|#)/.test(href)) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <Link href={href} className={cls} {...rest}>{inner}</Link>;
}

/** Quiet text link with an arrow ("Alle Funktionen ansehen →"). */
export function MoreLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const inner = <>{children}<ArrowRight size={16} strokeWidth={2} aria-hidden /></>;
  if (/^(mailto:|https?:|#)/.test(href)) return <a href={href} className={`s-more ${className}`}>{inner}</a>;
  return <Link href={href} className={`s-more ${className}`}>{inner}</Link>;
}

/** A page section separated by a thin rule. `head` = kicker/title/intro block above the content. */
export function SiteSection({ id, title, kicker, intro, children, tint, flush, narrow, labelledBy }: {
  id?: string; title?: ReactNode; kicker?: string; intro?: ReactNode; children?: ReactNode; tint?: boolean; flush?: boolean; narrow?: boolean; labelledBy?: string;
}) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section id={id} aria-labelledby={title ? hid : labelledBy} className={`s-section ${tint ? "s-section-tint" : ""} ${flush ? "s-section-flush" : ""}`}>
      <div className={`s-wrap ${narrow ? "s-narrow" : ""}`}>
        {title && (
          <div className="s-head">
            {kicker && <span className="s-kicker">{kicker}</span>}
            <h2 id={hid} className="s-h2">{title}</h2>
            {intro && <p className="s-lead">{intro}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Numbered steps with a strong top rule ("01", "02" …). */
export function Steps({ items, cols = 3 }: { items: { title: string; text: ReactNode }[]; cols?: number }) {
  return (
    <ol className="s-steps" style={{ "--cols": cols, "--cols-md": cols > 3 ? 2 : cols } as React.CSSProperties}>
      {items.map((s, i) => (
        <li key={s.title}>
          <span className="s-num" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
          <h3 className="s-h3">{s.title}</h3>
          <p className="s-text">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Check list (thin rules between rows). `no` items get a cross instead of a check. */
export function Checks({ items, plain, no }: { items: ReactNode[]; plain?: boolean; no?: boolean }) {
  return (
    <ul className={`s-checks ${plain ? "s-checks-plain" : ""}`}>
      {items.map((t, i) => (
        <li key={i}>{no ? <X size={18} strokeWidth={2.4} aria-hidden className="s-no" /> : <Check size={18} strokeWidth={2.4} aria-hidden />}<span>{t}</span></li>
      ))}
    </ul>
  );
}

const PHONE_SIZES = "(min-width: 960px) 300px, 78vw";

/** Real app screenshot (mobile 390 px, stored at 780 px) in a neutral CSS phone frame. Light/dark pair swaps with the theme (no JS).
 * priority = LCP image: light eager + high priority, dark preloaded for dark-system visitors only. Everything else lazy. */
export function PhoneShot({ name, alt, priority, small, className = "" }: { name: string; alt: string; priority?: boolean; small?: boolean; className?: string }) {
  const w = 780, h = 1688;
  if (priority) {
    const { props } = getImageProps({ src: `/marketing/${name}-dark.webp`, alt: "", width: w, height: h, sizes: PHONE_SIZES });
    if (props.srcSet) preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: PHONE_SIZES, fetchPriority: "high", media: "(prefers-color-scheme: dark)" });
  }
  return (
    <div className={`s-phone ${small ? "s-phone-sm" : ""} ${className}`}>
      <div className="s-phone-screen">
        <Image src={`/marketing/${name}-light.webp`} alt={alt} width={w} height={h} sizes={PHONE_SIZES} loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} className="s-img-light" />
        <Image src={`/marketing/${name}-dark.webp`} alt="" aria-hidden width={w} height={h} sizes={PHONE_SIZES} loading="lazy" className="s-img-dark" />
      </div>
    </div>
  );
}

const BROWSER_SIZES = "(min-width: 1120px) 620px, (min-width: 960px) 52vw, 100vw";

/** Desktop app screenshot (public/landing, 1600 px) in a quiet browser frame. Lazy unless `priority` (hero/LCP). */
export function BrowserShot({ name, alt, priority }: { name: string; alt: string; priority?: boolean }) {
  if (priority) {
    const { props } = getImageProps({ src: `/landing/${name}-dark.webp`, alt: "", width: 1600, height: 1280, sizes: BROWSER_SIZES });
    if (props.srcSet) preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: BROWSER_SIZES, fetchPriority: "high", media: "(prefers-color-scheme: dark)" });
  }
  return (
    <div className="s-browser">
      <div className="s-browser-bar" aria-hidden><i /><i /><i /></div>
      <Image src={`/landing/${name}-light.webp`} alt={alt} width={1600} height={1280} sizes={BROWSER_SIZES} loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} className="s-img-light" />
      <Image src={`/landing/${name}-dark.webp`} alt="" aria-hidden width={1600} height={1280} sizes={BROWSER_SIZES} loading="lazy" className="s-img-dark" />
    </div>
  );
}

/** Figure with caption under a screenshot. */
export function Shot({ caption, center, children }: { caption?: string; center?: boolean; children: ReactNode }) {
  return (
    <figure className={`s-figure ${center ? "s-figure-center" : ""}`}>
      {children}
      {caption && <figcaption className="s-caption">{caption}</figcaption>}
    </figure>
  );
}

/** Dark closing band with one heading, one sentence and the CTAs (centred). */
export function FinalCta({ id = "cta", title, text, children }: { id?: string; title: ReactNode; text?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="s-cta">
      <div className="s-wrap">
        <div className="s-cta-box">
          <h2 id={`${id}-h`} className="s-h2">{title}</h2>
          {text && <p>{text}</p>}
          <div className="s-actions">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Page hero for subpages: kicker, one h1, lead and actions; optional visual on the right. */
export function PageHero({ id, kicker, title, lead, children, note, visual }: {
  id: string; kicker?: string; title: ReactNode; lead?: ReactNode; children?: ReactNode; note?: ReactNode; visual?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="s-hero">
      <div className={`s-wrap ${visual ? "s-grid-2 s-wide-left" : ""}`}>
        <div>
          {kicker && <span className="s-kicker">{kicker}</span>}
          <h1 id={id} className="s-h1 s-h1-sm">{title}</h1>
          {lead && <p className="s-lead">{lead}</p>}
          {children && <div className="s-actions">{children}</div>}
          {note && <p className="s-small s-hero-note">{note}</p>}
        </div>
        {visual && <div className="s-hero-visual">{visual}</div>}
      </div>
    </section>
  );
}
