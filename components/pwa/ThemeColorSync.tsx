"use client";

import { useEffect } from "react";

/** Must match --paper in app/globals.css. */
const PAPER = { light: "#fff9ef", dark: "#15140f" } as const;

/**
 * The viewport's theme-color tags (app/layout.tsx) follow the OS scheme via `media`. A theme chosen in the app
 * (<html data-theme="dark"> while the OS is light, or the other way round) would leave the browser chrome / PWA status bar
 * in the wrong colour, so both tags are rewritten to the paper colour of the active theme whenever data-theme changes.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const html = document.documentElement;
    const apply = () => {
      const color = html.getAttribute("data-theme") === "dark" ? PAPER.dark : PAPER.light;
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
