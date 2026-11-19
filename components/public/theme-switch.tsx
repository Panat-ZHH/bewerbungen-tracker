"use client";

import { Moon, Sun } from "lucide-react";

/** Compact light/dark switch for the public header and footer. Same storage key as the app's ThemeToggle. */
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
    <button type="button" onClick={toggle} aria-label="Zwischen hellem und dunklem Design wechseln" className="s-theme">
      <Moon size={18} strokeWidth={2} aria-hidden className="[[data-theme=dark]_&]:hidden" />
      <Sun size={18} strokeWidth={2} aria-hidden className="hidden [[data-theme=dark]_&]:block" />
    </button>
  );
}
