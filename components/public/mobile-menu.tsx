"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ThemeSwitch } from "./theme-switch";
import "./mobile-menu.css";

type NavItem = { href: string; label: string };

/**
 * Mobile/tablet navigation for the public pages (below lg): a menu button that opens a bottom sheet.
 * Native <dialog> (showModal) gives the focus trap, Escape and an inert background; the page behind is scroll-locked
 * while it is open, and the sheet closes on every navigation (link tap or route change).
 */
export function PublicMobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigating = useRef(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); closeRef.current?.focus(); }
    if (!open && d.open) d.close();
    if (!open) return;
    const root = document.documentElement;
    const trigger = triggerRef.current;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    root.classList.add("public-menu-open");
    return () => {
      root.style.overflow = prev; root.classList.remove("public-menu-open");
      // Safari does not hand focus back to the opener of a modal dialog; do it here (not after a link tap: the new page owns focus).
      if (!navigating.current) trigger?.focus();
      navigating.current = false;
    };
  }, [open]);

  // Close when the route changes (e.g. browser back while the sheet is open).
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    navigating.current = true;
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] text-[var(--ink)] lg:hidden">
        <Menu size={20} strokeWidth={2.4} aria-hidden />
        <span className="sr-only">Menü öffnen</span>
      </button>
      <dialog ref={ref} aria-labelledby="public-menu-title" className="public-menu" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="public-menu-sheet">
          <div className="flex items-center justify-between gap-3 pb-2">
            <p id="public-menu-title" className="font-display text-lg font-extrabold tracking-[-.02em]">Menü</p>
            <div className="flex items-center gap-1">
              <ThemeSwitch />
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--hover)]">
                <X size={20} strokeWidth={2.4} aria-hidden />
                <span className="sr-only">Menü schliessen</span>
              </button>
            </div>
          </div>
          <nav aria-label="Hauptnavigation (mobil)">
            <ul className="public-menu-list">
              {items.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} onClick={() => { navigating.current = true; setOpen(false); }} aria-current={pathname === n.href ? "page" : undefined} className="public-menu-link">
                    {n.label}
                    <ArrowRight size={18} strokeWidth={2.4} aria-hidden className="shrink-0 text-[var(--muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ButtonLink href="/login" size="lg" full className="mt-4" onClick={() => { navigating.current = true; setOpen(false); }} icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Loslegen</ButtonLink>
        </div>
      </dialog>
    </>
  );
}
