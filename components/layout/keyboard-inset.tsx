"use client";

import { useEffect } from "react";

const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]),textarea,select,[contenteditable=''],[contenteditable='true']";
/** The on-screen keyboard takes at least this much of the layout viewport (smaller differences are URL bars / zoom). */
const KEYBOARD_MIN = 120;

/**
 * Phones: while the on-screen keyboard is open, `<html data-keyboard-open>` hides the fixed bottom nav (globals.css) and the
 * focused field is kept inside the visible area (visualViewport), also when the keyboard only appears after the focus.
 * Mounted once by WorkspaceShell. Nothing happens on devices without visualViewport or with a hardware keyboard.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const html = document.documentElement;
    let frame = 0;

    const editable = () => {
      const el = document.activeElement;
      return el instanceof HTMLElement && el.matches(EDITABLE) ? el : null;
    };
    const keepVisible = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const top = vv.offsetTop + 8;
      const bottom = vv.offsetTop + vv.height - 16;
      if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = editable();
        const open = Boolean(el) && window.innerHeight - vv.height * vv.scale > KEYBOARD_MIN && vv.scale <= 1.01;
        if (open) html.dataset.keyboardOpen = "true"; else delete html.dataset.keyboardOpen;
        if (open && el) keepVisible(el);
      });
    };
    const onFocusOut = () => window.setTimeout(update, 50); // next field may take the focus right away

    vv.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
      delete html.dataset.keyboardOpen;
    };
  }, []);
  return null;
}
