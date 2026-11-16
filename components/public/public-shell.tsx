import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { ThemeSwitch } from "./theme-switch";
import { BRAND_TAGLINE, CONTACT_EMAIL } from "./marketing";

export { CONTACT_EMAIL };

const nav = [
  { href: "/schulen", label: "Für Schulen" },
  { href: "/preise", label: "Preise" },
  { href: "/pilot", label: "Pilot" },
  { href: "/anleitung", label: "Anleitung" },
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Kontakt" },
];

const product = [
  { href: "/schulen", label: "Für Schulen" },
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
    <div className="workspace-bg flex min-h-[100dvh] flex-col text-[var(--ink)]">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:border-[length:var(--border-w)] focus:border-[var(--outline)] focus:shadow-[var(--shadow-md)]">Zum Inhalt springen</a>
      <header className="app-bar app-bar-top sticky top-0 z-40">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="mr-auto flex items-center gap-2.5 rounded-full py-1" aria-label="WendApply, zur Startseite">
            <BrandMark size={34} priority />
            <span className="font-display text-xl font-extrabold tracking-[-.03em]">WendApply</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-0.5 lg:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--ink)] underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-[var(--sun)]">{n.label}</Link>)}
          </nav>
          <ThemeSwitch />
          <ButtonLink href="/login" size="sm">Loslegen</ButtonLink>
        </div>
        <nav aria-label="Hauptnavigation (mobil)" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {nav.map((n) => <Link key={n.href} href={n.href} className="flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap text-[var(--ink)]">{n.label}</Link>)}
        </nav>
      </header>
      <main id="inhalt" className="flex-1">{children}</main>
      <footer className="app-bar app-bar-bottom">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.2fr_1fr_1.4fr] sm:px-6">
          <div>
            <div className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-[-.03em]"><BrandMark size={30} /> WendApply</div>
            <p className="mt-3 max-w-xs text-sm font-semibold">{BRAND_TAGLINE}</p>
            <p className="text-small mt-2 max-w-xs text-muted">Entwickelt in der Schweiz von Wendico.</p>
          </div>
          <nav aria-label="Produkt">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-1">
              {product.map((l) => <li key={l.href}><Link href={l.href} className="inline-block py-1.5 text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline">{l.label}</Link></li>)}
            </ul>
          </nav>
          <nav aria-label="Rechtliches und Datenschutz">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {legal.map((l) => <li key={l.href}><Link href={l.href} className="inline-block py-1.5 text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline">{l.label}</Link></li>)}
            </ul>
          </nav>
        </div>
        <div className="border-t-2 border-dashed border-[var(--line)] py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Wendico · WendApply</div>
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
