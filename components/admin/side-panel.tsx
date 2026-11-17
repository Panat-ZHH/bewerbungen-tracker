"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** True when `panel` is the top-most open dialog (a confirmation opened on top of the panel handles keys itself). */
function isTopDialog(panel: HTMLElement) {
  const open = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return open[open.length - 1] === panel;
}

/**
 * Detail panel that slides in from the right (full screen on phones). Esc / backdrop / close button call onClose.
 * Focus moves into the panel, is trapped there and goes back to the row that opened it. The list behind stays as it was.
 */
export function SidePanel({ open, onClose, title, children, testId }: { open: boolean; onClose: () => void; title: string; children: ReactNode; testId?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.focus();

    function onKey(event: KeyboardEvent) {
      if (!panel || !isTopDialog(panel)) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end overscroll-contain">
      <div className="animate-fade absolute inset-0 bg-[var(--overlay)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="animate-panel relative flex h-full w-full flex-col border-l-0 border-[var(--outline)] bg-[var(--paper)] outline-none sm:max-w-2xl sm:border-l-[length:var(--border-w)] sm:shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center justify-between gap-3 border-b-[length:var(--border-w)] border-dashed border-[var(--line)] px-4 py-2.5 sm:px-6">
          <p id={titleId} className="text-small font-semibold text-muted">{title}</p>
          <button type="button" onClick={onClose} aria-label="Schliessen" data-testid="admin-panel-close"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ink)] transition hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
            <X size={20} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(2rem+var(--safe-bottom))] pt-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
