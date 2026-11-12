"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, HandHelping, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { attentionText, studentLabel, type AttentionItem } from "@/lib/teacher-extras";
import { getAttention } from "@/lib/teacher-more";
import { ErrorBanner, teacherError } from "./shared";

/**
 * "Braucht Aufmerksamkeit": students without an application, with applications that got no reply for a while, and students who
 * voluntarily reported "noch keine Lehrstelle". Students who share nothing appear ONLY through that voluntary self-report.
 */
export function AttentionPanel({ classId = null, days = 14 }: { classId?: string | null; days?: number }) {
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { getAttention(classId, days).then((l) => { setItems(l); setError(""); }).catch((e) => setError(teacherError(e))); }, [classId, days]);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-label="Braucht Aufmerksamkeit">
      <h2 className="text-heading flex items-center gap-2"><TriangleAlert size={19} strokeWidth={2.2} className="text-[var(--warning-fg)]" aria-hidden /> Braucht Aufmerksamkeit {items && items.length > 0 && <Badge tone="warning">{items.length}</Badge>}</h2>
      {error && <div className="mt-3"><ErrorBanner message={error} onRetry={load} /></div>}
      {!items && !error && <Skeleton className="mt-3 h-20 rounded-[var(--radius-lg)]" />}
      {items && items.length === 0 && <p className="text-small mt-2 flex items-center gap-2 text-muted"><CheckCircle2 size={17} className="shrink-0 text-[var(--success-fg)]" aria-hidden /> Im Moment gibt es niemanden, der Aufmerksamkeit braucht.</p>}
      {items && items.length > 0 && (
        <div className="panel mt-3 px-3 py-1 sm:px-4">
          <ul className="rows">
            {items.map((item) => (
              <li key={`${item.classId}-${item.studentId}`}>
                <Link href={`/teacher/classes/${item.classId}/students/${item.studentId}`} className="row-link flex-wrap justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{studentLabel(item.displayName)}{!classId && <span className="text-small font-normal text-muted"> · {item.className}</span>}</p><p className="text-small text-muted">{attentionText(item)}</p></div>
                  {item.reason === "self_report" && <Badge tone="info"><HandHelping size={12} className="mr-1" aria-hidden />Eigene Meldung</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-small mt-3 text-muted">Wer seine Bewerbungen nicht teilt, erscheint hier nur, wenn die Person selbst «noch keine Lehrstelle» meldet.</p>
    </section>
  );
}
