"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHideBottomNav } from "@/components/layout/bottom-nav";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog. Bottom sheet on phones, centered modal from sm up.
 * ESC / backdrop click / close button call onClose. Focus is trapped and restored. Body scroll is locked.
 * Mobile: hides the tab bar while open, never taller than the visible viewport (dvh minus safe areas, minus the on-screen
 * keyboard via --kb / --vvh from KeyboardInset), body scrolls inside, footer actions stay visible above the home indicator.
 */
export function Modal({ open, onClose, title, description, children, footer, className }: { open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const descId = useId();

  useEffect(() => { closeRef.current = onClose; });
  useHideBottomNav(open);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center overscroll-contain pb-[var(--kb,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] sm:items-center sm:p-6 sm:pb-[max(1.5rem,var(--kb,0px))]">
      <div className="animate-fade absolute inset-0 bg-[var(--overlay)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn("animate-sheet sm:animate-pop max-h-sheet relative flex w-full flex-col rounded-t-[var(--radius-xl)] border-[length:var(--border-w)] border-b-0 border-[var(--outline)] bg-[var(--surface)] outline-none sm:max-w-lg sm:rounded-[var(--radius-xl)] sm:border-b-[length:var(--border-w)] sm:shadow-[var(--shadow-lg)]", className)}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[var(--edge)] sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-heading [overflow-wrap:anywhere]">{title}</h2>
            {description && <p id={descId} className="mt-1 text-small text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Schliessen" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ink)] transition hover:bg-[var(--hover)]"><X size={20} strokeWidth={2.4} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch]">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t-[length:var(--border-w)] border-[var(--line)] px-5 py-4 pb-[calc(1rem+var(--safe-bottom))] sm:flex-row sm:justify-end">{footer}</div>}
        {!footer && <div className="pb-[var(--safe-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}

export { Modal as Sheet };
