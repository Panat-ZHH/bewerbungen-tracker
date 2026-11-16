"use client";

import { useEffect } from "react";
import { detectPlatform } from "./platform";

/** Opens the install accordion that matches the visitor's device (ids install-ios|android|mac|windows) and shows its "Dein Gerät" tag. Renders nothing. */
export function PlatformOpen() {
  useEffect(() => {
    const p = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    const el = p && document.getElementById(`install-${p}`);
    if (!(el instanceof HTMLDetailsElement)) return;
    el.open = true;
    el.querySelector("[data-yours]")?.removeAttribute("hidden");
  }, []);
  return null;
}
