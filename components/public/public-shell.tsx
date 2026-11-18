import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { ThemeSwitch } from "./theme-switch";
import { PublicMobileMenu } from "./mobile-menu";
import "./public.css";
import { BRAND_TAGLINE, CONTACT_EMAIL } from "./marketing";

export { CONTACT_EMAIL };

const nav = [
  { href: "/schulen", label: "Für Schulen" },
  { href: "/familien", label: "Familien" },
  { href: "/preise", label: "Preise" },
  { href: "/pilot", label: "Pilot" },
  { href: "/anleitung", label: "Anleitung" },
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Kontakt" },
];

const product = [
  { href: "/schulen", label: "Für Schulen" },
  { href: "/familien", label: "Für Familien" },
  { href: "/preise", label: "Preise" },
  { href: "/pilot", label: "30-Tage-Pilot" },
  { href: "/anleitung", label: "Anleitung" },
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Kontakt" },
];

const legal = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz-uebersicht", label: "Datenschutz im Überblick" },
  { href: "/datenschutz", label: "Datenschutzerklärung" },
  { href: "/datenschutz-schulen", label: "Datenschutz für Schulen" },
  { href: "/datenschutz-jugend", label: "Datenschutz für Jugendliche" },
  { href: "/hosting", label: "Hosting" },
  { href: "/avv", label: "AVV-Vorlage" },
  { href: "/loeschkonzept", label: "Löschkonzept" },
];

/** Page frame for all public (no-login) pages: skip link, header, main, footer. Light and dark via the app's theme tokens. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-site workspace-bg flex min-h-[100dvh] flex-col text-[var(--ink)]">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:border-[length:var(--border-w)] focus:border-[var(--outline)] focus:shadow-[var(--shadow-md)]">Zum Inhalt springen</a>
      <header className="app-bar app-bar-top public-header sticky top-0 z-40">
        <div className="public-header-row mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 py-2.5 max-[359px]:gap-x-1.5">
          <Link href="/" className="mr-auto flex min-h-11 min-w-0 items-center gap-2.5 rounded-full max-[359px]:gap-2" aria-label="WendApply, zur Startseite">
            <BrandMark size={34} priority />
            <span className="font-display text-xl font-extrabold tracking-[-.03em] max-[359px]:text-lg">WendApply</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-0.5 lg:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-[var(--ink)] underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-[var(--sun)]">{n.label}</Link>)}
          </nav>
          <div className="hidden lg:block"><ThemeSwitch /></div>
          <ButtonLink href="/login" size="sm" className="min-h-11 max-[359px]:px-3">Loslegen</ButtonLink>
          <PublicMobileMenu items={nav} />
        </div>
      </header>
      <main id="inhalt" className="flex-1">{children}</main>
      <footer className="app-bar app-bar-bottom">
        <div className="public-footer-grid mx-auto grid w-full max-w-6xl gap-8 py-10 sm:grid-cols-[1.2fr_1fr_1.4fr]">
          <div>
            <div className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-[-.03em]"><BrandMark size={30} /> WendApply</div>
            <p className="mt-3 max-w-xs text-sm font-semibold">{BRAND_TAGLINE}</p>
            <p className="text-small mt-2 max-w-xs text-muted">Entwickelt in der Schweiz von Wendico.</p>
          </div>
          <nav aria-label="Produkt">
            <ul className="public-footer-links grid gap-x-6 text-sm sm:grid-cols-1">
              {product.map((l) => <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 min-w-11 items-center text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline">{l.label}</Link></li>)}
            </ul>
          </nav>
          <nav aria-label="Rechtliches und Datenschutz">
            <ul className="public-footer-links grid gap-x-6 text-sm">
              {legal.map((l) => <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 min-w-11 items-center text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline">{l.label}</Link></li>)}
            </ul>
          </nav>
        </div>
        <div className="public-footer-base border-t-2 border-dashed border-[var(--line)] pt-4 text-center text-xs text-muted">© {new Date().getFullYear()} Wendico · WendApply</div>
      </footer>
    </div>
  );
}

/** Shared section wrapper. */
export function Section({ id, title, intro, children, tint }: { id?: string; title: ReactNode; intro?: string; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={tint ? "border-y-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)]" : ""}>
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id={id ? `${id}-h` : undefined} className="text-title max-w-3xl">{title}</h2>
        {intro && <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{intro}</p>}
        <div className="mt-8 sm:mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Simple long-text page (Impressum, Kontakt, …). */
export function TextPage({ title, intro, children }: { title: ReactNode; intro?: string; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-display">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{intro}</p>}
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed">{children}</div>
      </article>
    </PublicShell>
  );
}

/** Marks facts that still have to be confirmed. Visible on purpose. */
export function Todo({ children }: { children: ReactNode }) {
  return <mark className="rounded-[var(--radius-sm)] bg-[var(--warning-bg)] px-1.5 py-0.5 text-[var(--warning-fg)]">[TODO: {children}]</mark>;
}
