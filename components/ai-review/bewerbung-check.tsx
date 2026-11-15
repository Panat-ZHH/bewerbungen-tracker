"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { ReviewForm, type ReviewFormValue } from "@/components/ai-review/review-form";
import { ReviewHistory } from "@/components/ai-review/review-history";
import { ReviewLoading } from "@/components/ai-review/review-loading";
import { ReviewResult } from "@/components/ai-review/review-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusMessage } from "@/components/ui/skeleton";
import { AiReviewRequestError, callAiReview, deleteAiReview, isAiReviewMock, listAiReviews } from "@/lib/ai-review";
import { AI_REVIEW_ERROR_MESSAGES, AI_REVIEW_LIMITS, formatReviewDate, reviewTitle, type AiReviewRecord } from "@/lib/ai-review-core";
import { getApplication } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { friendlyMessage } from "@/lib/ux";

type Phase = "form" | "loading" | "result";
type Shown = AiReviewRecord & { fresh?: boolean };

const emptyForm: ReviewFormValue = { file: null, consent: false, company: "", beruf: "", jobAd: "" };

export function BewerbungCheck() {
  const [form, setForm] = useState<ReviewFormValue>(emptyForm);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [shown, setShown] = useState<Shown>();
  const [history, setHistory] = useState<AiReviewRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [fromApplication, setFromApplication] = useState<{ id: string; company: string }>();
  const abort = useRef<AbortController | null>(null);
  const mock = isAiReviewMock() || Boolean(shown?.mock);

  const loadHistory = useCallback(async () => {
    try { setHistory(await listAiReviews()); setHistoryError(""); }
    catch (reason) { setHistoryError(friendlyMessage(reason, "Deine früheren Checks konnten nicht geladen werden.")); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    // Initial load of the past checks; setState only happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  // Opened from an application (?application=<id>): prefill Firma, Beruf and the job ad.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("application");
    if (!id) return;
    let active = true;
    getApplication(id)
      .then((application) => {
        if (!active || !application) return;
        setFromApplication({ id: application.id, company: application.company });
        setForm((current) => ({
          ...current,
          company: current.company || application.company.slice(0, AI_REVIEW_LIMITS.company),
          beruf: current.beruf || application.position.slice(0, AI_REVIEW_LIMITS.beruf),
          jobAd: current.jobAd || (application.jobDescription ?? "").slice(0, AI_REVIEW_LIMITS.jobAd),
        }));
      })
      .catch(() => { /* prefill is optional */ });
    return () => { active = false; };
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  async function submit() {
    if (!form.file) return;
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setPhase("loading");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const file = form.file;
    try {
      const response = await callAiReview(file, form, { signal: controller.signal });
      setShown({
        id: response.id ?? `neu-${response.createdAt}`,
        createdAt: response.createdAt,
        fileName: file.name,
        company: form.company?.trim() || null,
        beruf: form.beruf?.trim() || null,
        score: response.result.score,
        model: response.model,
        result: response.result,
        mock: response.mock,
        fresh: true,
      });
      setPhase("result");
      // the file and the consent belong to this one check; the company fields stay for the next try
      setForm((current) => ({ ...current, file: null, consent: false }));
      window.scrollTo({ top: 0 });
      loadHistory();
    } catch (reason) {
      if (controller.signal.aborted) { setPhase("form"); return; }
      setError(reason instanceof AiReviewRequestError ? reason.message : AI_REVIEW_ERROR_MESSAGES.unknown);
      if (reason instanceof AiReviewRequestError && reason.code === "consent_required") setForm((current) => ({ ...current, consent: false }));
      setPhase("form");
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }

  function cancel() {
    abort.current?.abort();
    setPhase("form");
  }

  function newCheck() {
    setShown(undefined);
    setError("");
    setPhase("form");
    window.scrollTo({ top: 0 });
  }

  function open(item: AiReviewRecord) {
    setShown(item);
    setPhase("result");
    window.scrollTo({ top: 0 });
  }

  async function remove(item: AiReviewRecord) {
    try {
      await deleteAiReview(item.id);
      setHistory((current) => current.filter((entry) => entry.id !== item.id));
      if (shown?.id === item.id) newCheck();
      toast({ message: "Check gelöscht" });
    } catch (reason) {
      toast({ tone: "danger", message: friendlyMessage(reason, "Der Check konnte nicht gelöscht werden.") });
    }
  }

  const badge = mock ? <Badge tone="warning" title="Vorschau: Es wird nichts an die KI geschickt. Das Ergebnis ist ein Beispiel." data-testid="ai-review-mock-badge">Vorschau-Modus</Badge> : null;

  return (
    <>
      {fromApplication && (
        <Link href={`/applications/${fromApplication.id}`} className="-mt-2 mb-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-[var(--ink)]">
          <ArrowLeft size={16} /> Zurück zur Bewerbung
        </Link>
      )}
      <PageHeader
        title={<>Bewerbungs-<span className="marker">Check</span></>}
        description="Lade deine Bewerbung hoch. Eine KI liest sie und sagt dir, was schon gut ist und was du noch verbessern kannst. Mit Beispielsätzen, die du kopieren kannst."
        actions={badge}
      />

      <div className="max-w-3xl pb-safe">
        {phase === "loading" ? (
          <ReviewLoading fileName={form.file?.name} onCancel={cancel} />
        ) : phase === "result" && shown ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{shown.fresh ? "Dein Ergebnis" : "Früherer Check"} · {[formatReviewDate(shown.createdAt), reviewTitle(shown)].filter(Boolean).join(" · ")}</p>
              <Button variant="secondary" onClick={newCheck} icon={<RotateCcw size={15} />}>Neuer Check</Button>
            </div>
            <ReviewResult result={shown.result} meta={shown.mock ? "Vorschau: Das ist ein Beispiel-Ergebnis, dein Brief wurde nicht an die KI geschickt." : undefined} />
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="sun" onClick={newCheck} icon={<RotateCcw size={15} />}>Überarbeiteten Brief checken</Button>
              {fromApplication && <Link href={`/applications/${fromApplication.id}`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--brand)] underline underline-offset-4">Zurück zur Bewerbung</Link>}
            </div>
          </>
        ) : (
          <>
            {error && <StatusMessage tone="danger" className="mb-6">{error}</StatusMessage>}
            <ReviewForm value={form} onChange={setForm} onSubmit={submit} prefilledFrom={fromApplication?.company} />
          </>
        )}

        {phase !== "loading" && (
          <ReviewHistory items={history} loading={historyLoading} error={historyError} activeId={phase === "result" ? shown?.id : undefined} onOpen={open} onDelete={remove} />
        )}
      </div>
    </>
  );
}
