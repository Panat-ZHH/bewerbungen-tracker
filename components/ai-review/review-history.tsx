"use client";

import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatReviewDate, reviewTitle, scoreLabel, type AiReviewRecord } from "@/lib/ai-review-core";
import { cn } from "@/lib/utils";

/** "Frühere Checks": open a past result or delete it (confirm dialog like in "Meine Dokumente"). */
export function ReviewHistory({ items, loading, error, activeId, onOpen, onDelete }: {
  items: AiReviewRecord[];
  loading: boolean;
  error?: string;
  activeId?: string;
  onOpen: (item: AiReviewRecord) => void;
  onDelete: (item: AiReviewRecord) => Promise<void>;
}) {
  const [toDelete, setToDelete] = useState<AiReviewRecord>();
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try { await onDelete(toDelete); } finally { setDeleting(false); setToDelete(undefined); }
  }

  return (
    <section aria-labelledby="ai-review-history" className="mt-14" data-testid="ai-review-history">
      <h2 id="ai-review-history" className="text-heading mb-1">Frühere Checks</h2>
      <p className="mb-3 text-sm text-muted">Nur das Ergebnis ist gespeichert, nicht deine Datei.</p>

      {loading ? (
        <div className="rows border-y-[length:var(--border-w)] border-[var(--outline)]" role="status" aria-label="Frühere Checks werden geladen">
          {[0, 1].map((item) => <div key={item} className="space-y-2 py-4"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-1/3" /></div>)}
        </div>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : items.length === 0 ? (
        <p className="border-y-[length:var(--border-w)] border-dashed border-[var(--line)] py-5 text-sm text-muted">Noch keine Checks. Dein erstes Ergebnis erscheint hier.</p>
      ) : (
        <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id} className="flex items-center gap-1">
                <button type="button" onClick={() => onOpen(item)} aria-current={active || undefined} className={cn("row-link min-w-0 flex-1 text-left", active && "bg-[var(--surface-2)]")}>
                  <span className="font-display tabular w-11 shrink-0 text-2xl font-extrabold leading-none">{item.score}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{reviewTitle(item)}</span>
                    <span className="text-small block truncate text-muted">{[formatReviewDate(item.createdAt), scoreLabel(item.score).label].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-[var(--muted)]" />
                </button>
                <button type="button" onClick={() => setToDelete(item)} aria-label={`Check «${reviewTitle(item)}» löschen`} title="Löschen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger-fg)] active:translate-y-px"><Trash2 size={17} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(toDelete)}
        onClose={() => !deleting && setToDelete(undefined)}
        title="Check löschen?"
        description={toDelete ? `Das Ergebnis «${reviewTitle(toDelete)}» wird gelöscht.` : undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setToDelete(undefined)} disabled={deleting}>Abbrechen</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Löschen</Button>
          </div>
        }
      >
        <p className="text-sm text-muted">Das kannst du nicht rückgängig machen. Deine Bewerbung selbst bleibt, wo sie ist.</p>
      </Modal>
    </section>
  );
}
