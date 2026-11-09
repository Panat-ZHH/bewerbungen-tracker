"use client";

import { Moon, Sun } from "lucide-react";

/** Compact light/dark switch for the public header. Same storage key as the app's ThemeToggle. */
export function ThemeSwitch() {
  function toggle() {
    const root = document.documentElement;
    const dark = root.getAttribute("data-theme") !== "dark";
    root.classList.add("theme-switching");
    if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
    try { localStorage.setItem("wendapply-theme", dark ? "dark" : "light"); } catch { /* private mode */ }
    window.setTimeout(() => root.classList.remove("theme-switching"), 300);
  }
  return (
    <button type="button" onClick={toggle} aria-label="Zwischen hellem und dunklem Design wechseln" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]">
      <Moon size={18} aria-hidden className="[[data-theme=dark]_&]:hidden" />
      <Sun size={18} aria-hidden className="hidden [[data-theme=dark]_&]:block" />
    </button>
  );
}
