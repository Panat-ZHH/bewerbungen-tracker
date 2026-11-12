"use client";

import { useState } from "react";
import Link from "next/link";
import { Hand, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllNoticesRead, markNoticeRead, useNotices } from "@/lib/notices";
import { formatDate } from "./shared";

const WEEK = 7 * 864e5;

/** Messages from teachers, shown open on the student home page (no expanding). Unread first, then read ones from the last 7 days. */
export function NoticesCard() {
  const { items, unread } = useNotices(true);
  const [now] = useState(() => Date.now());
  if (!items) return null;
  const shown = [...items.filter((n) => !n.read), ...items.filter((n) => n.read && now - new Date(n.createdAt).getTime() < WEEK)].slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <section aria-label="Mitteilungen deiner Lehrperson" className="panel mt-6 bg-[var(--sun-soft)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading flex items-center gap-2 text-base"><Megaphone size={18} strokeWidth={2.2} aria-hidden /> {unread > 0 ? (unread === 1 ? "1 neue Mitteilung" : `${unread} neue Mitteilungen`) : "Mitteilungen"}</h2>
        {unread > 1 && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" onClick={() => void markAllNoticesRead()}>Alle gelesen</Button>}
      </div>
      <ul className="rows mt-1 [&>*+*]:border-[var(--warning-line)]">
        {shown.map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-3">
            <span className="mt-0.5 shrink-0" aria-hidden>{n.kind === "announcement" ? <Megaphone size={16} /> : <Hand size={16} />}</span>
            <div className="min-w-0 flex-1">
              <p className={`whitespace-pre-wrap break-words text-sm ${n.read ? "" : "font-bold"}`}>{n.message || (n.kind === "nudge" ? "Deine Lehrperson erinnert dich ans Bewerben." : "Neue Nachricht")}</p>
              <p className="text-small mt-0.5 text-muted">{[n.className, formatDate(n.createdAt)].filter(Boolean).join(" · ")}</p>
            </div>
            {!n.read && <Button size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" onClick={() => void markNoticeRead(n.id)}>Gelesen</Button>}
          </li>
        ))}
      </ul>
      <Link href="/classes" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold underline decoration-2 underline-offset-4">Alle Mitteilungen in «Klassen»</Link>
    </section>
  );
}
