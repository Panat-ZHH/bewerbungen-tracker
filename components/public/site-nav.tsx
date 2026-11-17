"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

type Item = { href: string; label: string };

/**
 * Website header row: logo, desktop navigation, Anmelden + Kostenlos testen, and on small screens a disclosure menu
 * (button with aria-expanded/aria-controls, Escape closes and returns focus, closes on navigation). Tiny client component.
 */
export function SiteNav({ items, loginHref, signupHref, logo, themeSwitch }: { items: Item[]; loginHref: string; signupHref: string; logo: ReactNode; themeSwitch: ReactNode }) {
  const path = usePathname();
  // Open state is tied to the path it was opened on, so navigating closes the menu without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? path : null);
  const panelId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const current = (href: string) => (path === href ? "page" : undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenAt(null); btn.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="s-wrap s-header-row">
        {logo}
        <nav aria-label="Hauptnavigation" className="s-nav">
          {items.map((n) => <Link key={n.href} href={n.href} aria-current={current(n.href)}>{n.label}</Link>)}
        </nav>
        <div className="s-header-cta">
          {themeSwitch}
          <Link href={loginHref} className="s-btn s-btn-ghost">Anmelden</Link>
          <Link href={signupHref} className="s-btn s-btn-primary">Kostenlos testen</Link>
        </div>
        <Link href={loginHref} className="s-header-login s-header-login-m">Anmelden</Link>
        <div className="s-menu">
          <button ref={btn} type="button" className="s-menu-btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={18} strokeWidth={2.2} aria-hidden /> : <Menu size={18} strokeWidth={2.2} aria-hidden />}Menü
          </button>
        </div>
      </div>
      <div id={panelId} className="s-menu-panel s-menu" hidden={!open}>
        <nav aria-label="Hauptnavigation (mobil)" className="s-wrap">
          <ul>
            {items.map((n) => <li key={n.href}><Link href={n.href} aria-current={current(n.href)} onClick={() => setOpen(false)}>{n.label}</Link></li>)}
          </ul>
          <Link href={signupHref} className="s-btn s-btn-primary s-btn-lg s-btn-full" onClick={() => setOpen(false)}>Kostenlos testen</Link>
          <p className="s-fine" style={{ marginTop: 12, textAlign: "center" }}>7 Tage gratis für Schülerinnen, Schüler und Eltern.</p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>{themeSwitch}</div>
        </nav>
      </div>
    </>
  );
}
