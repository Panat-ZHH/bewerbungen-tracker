"use client";

import { useState } from "react";
import { Bell, Megaphone, Hand } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { MyNotification } from "@/lib/classes";
import { markAllNoticesRead, markNoticeRead, useNotices } from "@/lib/notices";

function ago(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 864e5);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

/** Bell for students: nudges and messages from teachers (my_notifications / mark_notification_read). Renders nothing when there are none. */
export function NotificationsBell() {
  const { items, unread } = useNotices();
  const [open, setOpen] = useState(false);
  const read = (n: MyNotification) => (n.read ? Promise.resolve() : markNoticeRead(n.id));
  const readAll = () => markAllNoticesRead();

  if (items === null || items.length === 0) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={unread ? `Mitteilungen, ${unread} ungelesen` : "Mitteilungen"} title="Mitteilungen" className="relative flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] active:scale-95 md:h-9 md:w-9 pointer-coarse:h-11 pointer-coarse:w-11">
        <Bell size={17} strokeWidth={1.8} />
        {unread > 0 && <span aria-hidden className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger-fg)] px-1 text-[10px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Mitteilungen" description="Nachrichten und Erinnerungen deiner Lehrpersonen."
        footer={unread > 0 ? <div className="flex justify-end"><button type="button" onClick={readAll} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--brand)] hover:underline">Alle als gelesen markieren</button></div> : undefined}>
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => read(n)} className={`flex min-h-14 w-full items-start gap-3 rounded-2xl border p-3 text-left transition active:scale-[.99] ${n.read ? "border-[var(--line)] bg-transparent" : "border-[var(--info-line)] bg-[var(--info-bg)]"}`}>
                <span className="mt-0.5 shrink-0 text-[var(--brand)]">{n.kind === "announcement" ? <Megaphone size={17} /> : <Hand size={17} />}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>{n.message || (n.kind === "nudge" ? "Deine Lehrperson erinnert dich ans Bewerben." : "Neue Nachricht")}</span>
                  <span className="text-small mt-0.5 block text-muted">{[n.className, ago(n.createdAt)].filter(Boolean).join(" · ")}</span>
                </span>
                {!n.read && <span className="sr-only">Ungelesen</span>}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
