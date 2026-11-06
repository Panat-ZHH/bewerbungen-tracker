"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, HandHelping, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    <section className="space-y-3" aria-label="Braucht Aufmerksamkeit">
      <h2 className="text-heading flex items-center gap-2"><TriangleAlert size={18} className="text-[var(--warning-fg)]" aria-hidden /> Braucht Aufmerksamkeit {items && items.length > 0 && <Badge tone="warning">{items.length}</Badge>}</h2>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!items && !error && <Skeleton className="h-20 rounded-[var(--radius-lg)]" />}
      {items && items.length === 0 && <Card className="text-small flex items-center gap-3 p-4 text-muted"><CheckCircle2 size={18} className="text-[var(--success-fg)]" aria-hidden /> Im Moment gibt es niemanden, der Aufmerksamkeit braucht.</Card>}
      {items && items.length > 0 && (
        <Card className="divide-y divide-[var(--line)] overflow-hidden">
          <ul>
            {items.map((item) => (
              <li key={`${item.classId}-${item.studentId}`}>
                <Link href={`/teacher/classes/${item.classId}/students/${item.studentId}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-[var(--hover)]">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{studentLabel(item.displayName)}{!classId && <span className="text-small font-normal text-muted"> · {item.className}</span>}</p><p className="text-small text-muted">{attentionText(item)}</p></div>
                  {item.reason === "self_report" && <Badge tone="info"><HandHelping size={12} className="mr-1" aria-hidden />Eigene Meldung</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-small text-muted">Wer seine Bewerbungen nicht teilt, erscheint hier nur, wenn die Person selbst «noch keine Lehrstelle» meldet.</p>
    </section>
  );
}
