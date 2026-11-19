"use client";

import { forwardRef, type CSSProperties, type Ref } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cardButtons, stepIndicator, type Placement } from "./tour-core";

export interface TourCardProps {
  index: number;
  total: number;
  title: string;
  text: string;
  titleId: string;
  textId: string;
  placement: Placement | null;
  animate: boolean;
  titleRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

/**
 * The description card (SPEC-FLOW §6.3): «3 / 6» + close, title (focus target), text (max 2 sentences), dots, Zurück / Weiter
 * (Fertig on the last step), Überspringen as a ghost link. Non-modal guide, but focus stays in here while it is open.
 */
export const TourCard = forwardRef(function TourCard(p: TourCardProps, ref: Ref<HTMLDivElement>) {
  const ind = stepIndicator(p.index, p.total);
  const btn = cardButtons(p.index, p.total);
  const last = btn.primary === "Fertig";
  const style: CSSProperties = p.placement
    ? { top: p.placement.top, left: p.placement.left, width: p.placement.width }
    : { visibility: "hidden", top: 0, left: 16, width: "min(340px, calc(100vw - 32px))" };
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={p.titleId}
      aria-describedby={p.textId}
      data-tour-card=""
      data-side={p.placement?.side ?? "none"}
      data-testid="tour-card"
      className={`wa-tour-card panel fixed p-4 ${p.animate ? "wa-tour-rise" : ""}`}
      style={style}
    >
      {p.placement?.arrowX != null && (p.placement.side === "below" || p.placement.side === "above") && (
        <span aria-hidden className={`wa-tour-arrow ${p.placement.side === "below" ? "wa-tour-arrow-up" : "wa-tour-arrow-down"}`} style={{ left: p.placement.arrowX - 8 }} />
      )}
      {p.placement?.arrowY != null && (p.placement.side === "right" || p.placement.side === "left") && (
        <span aria-hidden className={`wa-tour-arrow ${p.placement.side === "right" ? "wa-tour-arrow-left" : "wa-tour-arrow-right"}`} style={{ top: p.placement.arrowY - 8 }} />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-small tabular text-muted" aria-hidden data-testid="tour-indicator">{ind.visual}</span>
        {!last && (
          <button type="button" onClick={p.onSkip} aria-label="Tour überspringen" title="Tour überspringen" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]">
            <X size={20} aria-hidden />
          </button>
        )}
      </div>
      <h2 id={p.titleId} ref={p.titleRef} tabIndex={-1} className="text-heading mt-1 outline-none [overflow-wrap:anywhere]">
        <span className="sr-only">{ind.spoken} </span>{p.title}
      </h2>
      <p id={p.textId} className="mt-1 text-body [overflow-wrap:anywhere]">{p.text}</p>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {Array.from({ length: p.total }, (_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= p.index ? "bg-[var(--ink)]" : "border-[length:var(--border-w)] border-[var(--line)]"}`} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {btn.back ? <Button size="sm" variant="secondary" className="min-h-11" onClick={p.onBack} data-testid="tour-back">Zurück</Button> : <span />}
        <Button size="sm" className="min-h-11" onClick={p.onNext} data-testid="tour-next">{btn.primary}{!last && <ArrowRight size={16} aria-hidden />}</Button>
      </div>
      {btn.skip && (
        <button type="button" onClick={p.onSkip} data-testid="tour-skip" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--muted)] underline decoration-2 underline-offset-4 hover:text-[var(--ink)]">{btn.skip}</button>
      )}
    </div>
  );
});
