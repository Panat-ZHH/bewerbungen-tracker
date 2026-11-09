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
    <section aria-label="Mitteilungen deiner Lehrperson" className="mt-6 rounded-[var(--radius-lg)] border border-[var(--info-line)] bg-[var(--info-bg)] p-4 text-[var(--info-fg)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Megaphone size={17} aria-hidden /> {unread > 0 ? (unread === 1 ? "1 neue Mitteilung" : `${unread} neue Mitteilungen`) : "Mitteilungen"}</h2>
        {unread > 1 && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" onClick={() => void markAllNoticesRead()}>Alle gelesen</Button>}
      </div>
      <ul className="mt-2 space-y-2">
        {shown.map((n) => (
          <li key={n.id} className={`flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--solid)] p-3 text-[var(--ink)] ${n.read ? "opacity-75" : ""}`}>
            <span className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden>{n.kind === "announcement" ? <Megaphone size={16} /> : <Hand size={16} />}</span>
            <div className="min-w-0 flex-1">
              <p className={`whitespace-pre-wrap break-words text-sm ${n.read ? "" : "font-semibold"}`}>{n.message || (n.kind === "nudge" ? "Deine Lehrperson erinnert dich ans Bewerben." : "Neue Nachricht")}</p>
              <p className="text-small mt-0.5 text-muted">{[n.className, formatDate(n.createdAt)].filter(Boolean).join(" · ")}</p>
            </div>
            {!n.read && <Button size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" onClick={() => void markNoticeRead(n.id)}>Gelesen</Button>}
          </li>
        ))}
      </ul>
      <Link href="/classes" className="mt-2 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[var(--brand)] hover:underline">Alle Mitteilungen in «Klassen»</Link>
    </section>
  );
}
