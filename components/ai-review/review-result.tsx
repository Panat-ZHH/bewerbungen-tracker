"use client";

import { useState } from "react";
import { ArrowRight, Building2, Check, Copy, Info, Lightbulb } from "lucide-react";
import { DoodleStar, DoodleUnderline } from "@/components/ui/doodles";
import { StatusMessage } from "@/components/ui/skeleton";
import { AI_REVIEW_CATEGORIES, categoryLevel, clampScore, scoreLabel, type AiReviewResult } from "@/lib/ai-review-core";
import type { AiReviewExample, AiReviewTip } from "@/supabase/functions/ai-review/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const stickerTone = { mint: "sticker-mint", sun: "", blue: "sticker-blue", paper: "sticker-paper" } as const;
const barTone = { strong: "bg-[var(--mint)]", ok: "bg-[var(--sun)]", work: "bg-[var(--coral)]" } as const;

/** Full result of one check: score, breakdown, what is good, what to improve (with copyable sentences), company tips, next step. */
export function ReviewResult({ result, meta }: { result: AiReviewResult; meta?: React.ReactNode }) {
  const score = clampScore(result.score, 100);
  const label = scoreLabel(score);
  // keep the contract order even if the server sent another one
  const breakdown = AI_REVIEW_CATEGORIES.map((category) => result.breakdown.find((item) => item.key === category.key)).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="space-y-10" data-testid="ai-review-result">
      <section className="panel animate-rise relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10" aria-labelledby="ai-review-score">
        <DoodleStar className="absolute right-4 top-4 h-8 w-8 text-[var(--sun)]" />
        <div className="flex items-end gap-3">
          <p id="ai-review-score" className="num-display" aria-label={`${score} von 100 Punkten`}>{score}</p>
          <div className="pb-1">
            <p className="text-sm font-semibold text-muted">von 100</p>
            <span className={cn("sticker tilt-l mt-2", stickerTone[label.tone])}>{label.label}</span>
          </div>
        </div>
        <div className="min-w-0 md:pr-8">
          <p className="font-display text-xl font-bold leading-snug tracking-[-.01em] sm:text-2xl">{result.summary || label.text}</p>
          {result.summary && <p className="mt-2 text-sm text-muted">{label.text}</p>}
          {meta && <div className="text-small mt-3 text-muted">{meta}</div>}
        </div>
      </section>

      <section aria-labelledby="ai-review-breakdown">
        <h2 id="ai-review-breakdown" className="text-heading mb-2">So setzt sich das zusammen</h2>
        <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">
          {breakdown.map((item) => {
            const value = clampScore(item.score, 20);
            const level = categoryLevel(value);
            return (
              <li key={item.key} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-center">
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <h3 className="text-base font-bold">{item.label}</h3>
                  <p className="text-sm text-muted"><span className="tabular font-display text-lg font-extrabold text-[var(--ink)]">{value}</span> / 20 · {level.label}</p>
                </div>
                <div className="min-w-0">
                  <div className="h-3 overflow-hidden rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)]" role="meter" aria-valuemin={0} aria-valuemax={20} aria-valuenow={value} aria-label={`${item.label}: ${value} von 20`}>
                    <div className={cn("h-full border-r-[length:var(--border-w)] border-[var(--outline)]", barTone[level.tone], value === 0 && "border-r-0")} style={{ width: `${(value / 20) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-sm leading-6">{item.comment}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {result.good.length > 0 && (
        <section aria-labelledby="ai-review-good">
          <h2 id="ai-review-good" className="text-heading mb-3">Das ist schon <span className="marker">gut</span></h2>
          <ul className="space-y-2.5">
            {result.good.map((item, index) => (
              <li key={index} className="flex items-start gap-3 text-[15px] leading-6">
                <Check size={20} strokeWidth={2.6} aria-hidden className="mt-0.5 shrink-0 text-[var(--success-fg)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.improve.length > 0 && (
        <section aria-labelledby="ai-review-improve">
          <h2 id="ai-review-improve" className="text-heading mb-1">Das kannst du verbessern</h2>
          <p className="mb-4 text-sm text-muted">Das Wichtigste zuerst. Die Nachher-Sätze kannst du kopieren und an deinen Brief anpassen.</p>
          <ol className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">
            {result.improve.map((tip, index) => <TipItem key={index} tip={tip} number={index + 1} icon={<Lightbulb size={20} strokeWidth={2.2} aria-hidden />} />)}
          </ol>
        </section>
      )}

      {result.company.length > 0 && (
        <section aria-labelledby="ai-review-company">
          <h2 id="ai-review-company" className="text-heading mb-1">Tipps für diese Firma</h2>
          <p className="mb-4 text-sm text-muted">Damit merkt der Betrieb, dass du dich wirklich für ihn interessierst.</p>
          <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">
            {result.company.map((tip, index) => <TipItem key={index} tip={tip} icon={<Building2 size={20} strokeWidth={2.2} aria-hidden />} />)}
          </ul>
        </section>
      )}

      {result.nextStep && (
        <section aria-labelledby="ai-review-next" className="inset relative px-5 py-5 sm:px-6">
          <h2 id="ai-review-next" className="text-heading flex items-center gap-2"><ArrowRight size={20} strokeWidth={2.6} aria-hidden className="text-[var(--brand)]" />Dein nächster Schritt</h2>
          <p className="mt-2 font-display text-lg font-bold leading-snug tracking-[-.01em]">{result.nextStep}</p>
          <DoodleUnderline className="mt-1 h-3 w-28 text-[var(--sun)]" />
        </section>
      )}

      <StatusMessage tone="info" icon={<Info />}>
        <p className="font-semibold">Eine KI kann sich irren.</p>
        <p className="mt-0.5">Nimm die Tipps als Ideen, nicht als Befehle. Lass deinen Brief auch von einer Lehrperson oder deinen Eltern lesen, bevor du ihn abschickst.</p>
      </StatusMessage>
    </div>
  );
}

function TipItem({ tip, number, icon }: { tip: AiReviewTip; number?: number; icon: React.ReactNode }) {
  return (
    <li className="py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[var(--brand)]">{number ? <span className="font-display tabular text-xl font-extrabold leading-none">{number}</span> : icon}</span>
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-6">{tip.tipp}</p>
      </div>
      {tip.beispiel && <Example example={tip.beispiel} />}
    </li>
  );
}

function Example({ example }: { example: AiReviewExample }) {
  const missing = !example.vorher || /^fehlt\.?$/i.test(example.vorher.trim());
  return (
    <div className="mt-3 grid gap-3 sm:ml-8 md:grid-cols-2">
      <div className="min-w-0 rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-dashed border-[var(--line)] px-4 py-3">
        <p className="text-small font-semibold text-muted">Vorher</p>
        <p className={cn("mt-1 text-sm leading-6", missing ? "italic text-muted" : "text-muted")}>{missing ? "Fehlt noch in deinem Brief." : `«${example.vorher}»`}</p>
      </div>
      <div className="inset min-w-0 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-small font-semibold text-[var(--success-fg)]">Nachher</p>
          <CopyButton text={example.nachher} />
        </div>
        <p className="mt-1 text-sm font-medium leading-6">«{example.nachher}»</p>
        {example.warum && <p className="text-small mt-2 text-muted">{example.warum}</p>}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ message: "Satz kopiert. Füg ihn in deinen Brief ein." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ tone: "danger", message: "Kopieren hat nicht geklappt. Markiere den Satz und kopiere ihn selbst." });
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Kopiert" : "Nachher-Satz kopieren"} className="-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--hover)] active:translate-y-px">
      {copied ? <Check size={15} strokeWidth={2.6} aria-hidden className="text-[var(--success-fg)]" /> : <Copy size={15} aria-hidden />}
      {copied ? "Kopiert" : "Kopieren"}
    </button>
  );
}

