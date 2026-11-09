import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { ThemeSwitch } from "./theme-switch";

export const CONTACT_EMAIL = "info.wendico@gmail.com";

const nav = [
  { href: "/schulen", label: "Für Schulen" },
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Kontakt" },
];

const legal = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/datenschutz-schulen", label: "Datenschutz für Schulen" },
  { href: "/datenschutz-jugend", label: "Datenschutz für Jugendliche" },
  { href: "/hosting", label: "Hosting" },
  { href: "/loeschkonzept", label: "Löschkonzept" },
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Kontakt" },
];

/** Page frame for all public (no-login) pages: skip link, header, main, footer. Light and dark via the app's theme tokens. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-bg flex min-h-[100dvh] flex-col text-[var(--ink)]">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-[var(--solid)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-[var(--shadow-md)]">Zum Inhalt springen</a>
      <header className="glass-bar sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="mr-auto flex items-center gap-2.5 rounded-full py-1 font-semibold tracking-tight" aria-label="WendApply, zur Startseite">
            <BrandMark size={34} radius={10} priority />
            <span className="text-[17px]">WendApply</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]">{n.label}</Link>)}
          </nav>
          <ThemeSwitch />
          <ButtonLink href="/login" size="sm">Loslegen</ButtonLink>
        </div>
        <nav aria-label="Hauptnavigation (mobil)" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
          {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-full px-3 py-2 text-[13px] font-medium whitespace-nowrap text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]">{n.label}</Link>)}
        </nav>
      </header>
      <main id="inhalt" className="flex-1">{children}</main>
      <footer className="border-t border-[var(--line)] bg-[var(--glass-bar-bg)]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.2fr_2fr] sm:px-6">
          <div>
            <div className="flex items-center gap-2.5 font-semibold"><BrandMark size={30} radius={9} /> WendApply</div>
            <p className="text-small mt-3 max-w-xs text-muted">Die Begleit-App für die Lehrstellensuche. Entwickelt in der Schweiz von Wendico.</p>
          </div>
          <nav aria-label="Rechtliches und Hilfe">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {legal.map((l) => <li key={l.href + l.label}><Link href={l.href} className="inline-block py-1.5 text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline">{l.label}</Link></li>)}
            </ul>
          </nav>
        </div>
        <div className="border-t border-[var(--line)] py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Wendico · WendApply</div>
      </footer>
    </div>
  );
}

/** Shared section wrapper. */
export function Section({ id, eyebrow, title, intro, children, tint }: { id?: string; eyebrow?: string; title: string; intro?: string; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={tint ? "border-y border-[var(--line)] bg-[var(--raised)]" : ""}>
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
        <h2 id={id ? `${id}-h` : undefined} className="text-title mt-3 max-w-3xl">{title}</h2>
        {intro && <p className="text-body mt-3 max-w-2xl text-muted">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/** Simple long-text page (Impressum, Kontakt, …). */
export function TextPage({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
        <h1 className="text-display mt-3">{title}</h1>
        {intro && <p className="text-body mt-4 text-muted">{intro}</p>}
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed">{children}</div>
      </article>
    </PublicShell>
  );
}

/** Marks facts that still have to be confirmed. Visible on purpose. */
export function Todo({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-[var(--warning-bg)] px-1.5 py-0.5 text-[var(--warning-fg)]">[TODO: {children}]</mark>;
}
