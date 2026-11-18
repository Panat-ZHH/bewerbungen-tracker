"use client";

import { useEffect } from "react";

/**
 * Contract for the fixed mobile tab bar (components/layout/workspace-shell.tsx), CSS in app/globals.css:
 * - `--bottom-nav-h`   height of the bar's tap row (0 from md up and while the bar is hidden).
 * - `--bottom-nav-pad` the bar's own bottom padding inside the home-indicator area (part of env(safe-area-inset-bottom)).
 * - `--bottom-clearance` what fixed/sticky content at the bottom of a phone screen must keep free:
 *   the bar plus its padding, or just the safe area when the bar is hidden / on tablets and desktops.
 * The bar is hidden (and every clearance drops to the safe area) while one of these is set:
 *   html[data-hide-bottom-nav]  – via useHideBottomNav() below (map sheets, placement tools, full-screen editors)
 *   body.sheet-open             – plain-CSS escape hatch for code that cannot use the hook
 *   html[data-keyboard-open]    – set by KeyboardInset while the on-screen keyboard is open
 */
const ATTR = "hideBottomNav";
let holders = 0;

function sync() {
  const html = document.documentElement;
  if (holders > 0) html.dataset[ATTR] = "true";
  else delete html.dataset[ATTR];
}

/** Hide the mobile tab bar while `active` (ref-counted: several sheets can ask at the same time). */
export function useHideBottomNav(active: boolean) {
  useEffect(() => {
    if (!active) return;
    holders += 1;
    sync();
    return () => {
      holders = Math.max(0, holders - 1);
      sync();
    };
  }, [active]);
}
