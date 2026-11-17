import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeSwitch } from "./theme-switch";
import { SiteNav } from "./site-nav";
import { SiteSection } from "./site-ui";
import { BRAND_TAGLINE, CONTACT_EMAIL, LOGIN_HREF, SIGNUP_HREF } from "./marketing";
import "./site.css";

export { CONTACT_EMAIL };

/** Header navigation (max. 5 items, copy deck §1.1). Mobile: same items in the menu panel. */
const nav = [
  { href: "/funktionen", label: "Funktionen" },
  { href: "/familien", label: "Für Eltern" },
  { href: "/schulen", label: "Für Schulen" },
  { href: "/preise", label: "Preise" },
  { href: "/faq", label: "FAQ" },
];

/** Footer sitemap (copy deck §1.2). */
const footer: { title: string; links: { href: string; label: string }[] }[] = [
  { title: "WendApply", links: [
    { href: "/funktionen", label: "Funktionen" },
    { href: "/preise", label: "Preise" },
    { href: "/anleitung", label: "Anleitung" },
    { href: "/faq", label: "FAQ" },
    { href: "/hilfe", label: "Hilfe" },
  ] },
  { title: "Für wen", links: [
    { href: "/funktionen#stellen", label: "Schülerinnen und Schüler" },
    { href: "/familien", label: "Eltern" },
    { href: "/schulen", label: "Schulen und Lehrpersonen" },
    { href: "/pilot", label: "30-Tage-Pilot" },
  ] },
  { title: "Über WendApply", links: [
    { href: "/ueber-uns", label: "Über uns" },
    { href: "/kontakt", label: "Kontakt" },
    { href: "/impressum", label: "Impressum" },
  ] },
  { title: "Datenschutz", links: [
    { href: "/datenschutz-uebersicht", label: "Datenschutz im Überblick" },
    { href: "/datenschutz", label: "Datenschutzerklärung" },
    { href: "/datenschutz-jugend", label: "Datenschutz für Jugendliche" },
    { href: "/datenschutz-schulen", label: "Datenschutz für Schulen" },
    { href: "/hosting", label: "Hosting" },
    { href: "/avv", label: "AVV-Vorlage" },
    { href: "/loeschkonzept", label: "Löschkonzept" },
  ] },
];

/** Page frame for all public (no-login) pages: skip link, header, main, footer. Calm website look scoped under .site (site.css). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <a href="#inhalt" className="s-skip">Zum Inhalt springen</a>
      <header className="s-header">
        <SiteNav items={nav} loginHref={LOGIN_HREF} signupHref={SIGNUP_HREF}
          logo={<Link href="/" className="s-logo" aria-label="WendApply, zur Startseite"><BrandMark size={32} priority /><span>WendApply</span></Link>}
          themeSwitch={<ThemeSwitch />} />
      </header>
      <main id="inhalt" tabIndex={-1}>{children}</main>
      <footer className="s-footer">
        <div className="s-wrap">
          <div className="s-footer-grid">
            <div className="s-footer-brand">
              <Link href="/" className="s-logo" aria-label="WendApply, zur Startseite"><BrandMark size={28} /><span>WendApply</span></Link>
              <p className="s-fine" style={{ marginTop: 12, maxWidth: "30ch" }}>{BRAND_TAGLINE}</p>
            </div>
            {footer.map((col) => (
              <nav key={col.title} aria-labelledby={`f-${col.title}`}>
                <h2 id={`f-${col.title}`}>{col.title}</h2>
                <ul>{col.links.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}</ul>
              </nav>
            ))}
          </div>
          <div className="s-footer-base">
            <p style={{ margin: 0 }}>© {new Date().getFullYear()} WendApply ist ein Angebot von Wendico, Kleinandelfingen. Keine Werbung. Keine Analyse-Tracker.</p>
            <ThemeSwitch />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Shared section wrapper (kept for /anleitung and /datenschutz-uebersicht). */
export function Section({ id, title, intro, children, tint }: { id?: string; title: ReactNode; intro?: string; children: ReactNode; tint?: boolean }) {
  return <SiteSection id={id} title={title} intro={intro} tint={tint}>{children}</SiteSection>;
}

/** Simple long-text page (Impressum, Hilfe, …): one h1, optional intro, calm prose. */
export function TextPage({ title, intro, children }: { title: ReactNode; intro?: string; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="s-hero">
        <div className="s-wrap s-narrow">
          <h1 className="s-h1 s-h1-sm">{title}</h1>
          {intro && <p className="s-lead">{intro}</p>}
          <div className="s-prose" style={{ marginTop: 48 }}>{children}</div>
        </div>
      </article>
    </PublicShell>
  );
}

/** Marks facts that still have to be confirmed. Visible on purpose. */
export function Todo({ children }: { children: ReactNode }) {
  return <mark className="rounded-[var(--radius-sm)] bg-[var(--warning-bg)] px-1.5 py-0.5 text-[var(--warning-fg)]">[TODO: {children}]</mark>;
}
