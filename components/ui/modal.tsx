"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog. Bottom sheet on phones, centered modal from sm up.
 * ESC / backdrop click / close button call onClose. Focus is trapped and restored. Body scroll is locked.
 */
export function Modal({ open, onClose, title, description, children, footer, className }: { open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const descId = useId();

  useEffect(() => { closeRef.current = onClose; });

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
    <div className="fixed inset-0 z-[100] overscroll-contain flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn("animate-sheet sm:animate-pop relative flex max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] w-full flex-col rounded-t-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--sheet-bg)] shadow-[var(--shadow-lg)] outline-none sm:max-w-lg sm:rounded-[var(--radius-xl)]", className)}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--line)] sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-heading">{title}</h2>
            {description && <p id={descId} className="mt-1 text-small text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Schliessen" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] px-5 py-4 pb-[calc(1rem+var(--safe-bottom))] sm:flex-row sm:justify-end">{footer}</div>}
        {!footer && <div className="pb-[var(--safe-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}

export { Modal as Sheet };
