"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { LOGIN_LABEL, SIGNUP_LABEL } from "./auth-links";

type Item = { href: string; label: string };

/**
 * Website header row: logo, desktop navigation, Anmelden + Kostenlos testen, and on small screens a disclosure menu
 * (button with aria-expanded/aria-controls, Escape closes and returns focus, closes on navigation). Tiny client component.
 * Two separate entries everywhere (SPEC-FLOW §5): «Kostenlos testen» -> signupHref (/start), «Anmelden» -> loginHref (/login).
 * Phones: logo · Anmelden · Kostenlos testen · Menü in one row (wordmark yields < 480 px, «Anmelden» < 360 px – it stays in the menu).
 * Entry links are not prefetched in the viewport (the auth routes pull in the Supabase client).
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
          <Link href={loginHref} prefetch={false} className="s-btn s-btn-secondary" data-testid="header-login">{LOGIN_LABEL}</Link>
          <Link href={signupHref} prefetch={false} className="s-btn s-btn-primary" data-testid="header-signup">{SIGNUP_LABEL}</Link>
        </div>
        <Link href={loginHref} prefetch={false} className="s-header-login s-header-login-m" data-testid="header-login-mobile">{LOGIN_LABEL}</Link>
        <Link href={signupHref} prefetch={false} className="s-btn s-btn-primary s-btn-sm s-header-signup-m" data-testid="header-signup-mobile">{SIGNUP_LABEL}</Link>
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
          <Link href={signupHref} prefetch={false} className="s-btn s-btn-primary s-btn-lg s-btn-full" data-testid="menu-signup" onClick={() => setOpen(false)}>{SIGNUP_LABEL}</Link>
          <Link href={loginHref} prefetch={false} className="s-btn s-btn-secondary s-btn-lg s-btn-full" style={{ marginTop: 10 }} data-testid="menu-login" onClick={() => setOpen(false)}>{LOGIN_LABEL}</Link>
          <div className="s-menu-foot">
            <p className="s-fine" style={{ margin: 0 }}>7 Tage gratis für Schülerinnen, Schüler und Eltern.</p>
            {themeSwitch}
          </div>
        </nav>
      </div>
    </>
  );
}
