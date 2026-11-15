"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DoodleSparkle } from "@/components/ui/doodles";
import { LOADING_STEPS, loadingProgress, loadingStep } from "@/lib/ai-review-core";

/** Friendly waiting screen while the AI reads the letter (up to ~30 s). */
export function ReviewLoading({ fileName, onCancel }: { fileName?: string; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, []);

  const step = loadingStep(elapsed);
  const progress = loadingProgress(elapsed);
  const segments = LOADING_STEPS.length;
  const filled = Math.max(1, Math.round(progress * segments));

  return (
    <section className="panel animate-rise relative mx-auto max-w-xl px-5 py-8 text-center sm:px-8 sm:py-10" aria-labelledby="ai-review-loading-title" data-testid="ai-review-loading">
      <DoodleSparkle className="absolute right-5 top-4 h-7 w-7 animate-wiggle text-[var(--sun)]" />
      <span className="spinner mx-auto block !h-9 !w-9 text-[var(--brand)]" aria-hidden />
      <h2 id="ai-review-loading-title" className="text-heading mt-5">Dein Brief wird gecheckt</h2>
      <p className="mt-2 min-h-12 text-body" role="status" aria-live="polite">{step}</p>
      <div className="mx-auto mt-5 flex max-w-xs gap-1.5" aria-hidden>
        {Array.from({ length: segments }, (_, index) => (
          <span key={index} className={`h-2.5 flex-1 rounded-full border-[length:var(--border-w)] border-[var(--outline)] transition-colors duration-500 ${index < filled ? "bg-[var(--sun)]" : "bg-[var(--surface-2)]"}`} />
        ))}
      </div>
      <p className="text-small mt-5 text-muted">Das kann bis zu 30 Sekunden dauern. {fileName ? <>Datei: <span className="font-semibold text-[var(--ink)]">{fileName}</span></> : null}</p>
      <Button variant="ghost" onClick={onCancel} className="mt-4">Abbrechen</Button>
    </section>
  );
}
