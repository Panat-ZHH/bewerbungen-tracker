"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarClock, Hourglass } from "lucide-react";
import { computeReminders, DEFAULT_SETTINGS, type Reminder } from "@/lib/reminders";
import { loadReminderSettings, todayLocal } from "@/lib/reminders-client";
import type { Application } from "@/types";

/** Dashboard section «Erinnerungen»: computed from the applications, no extra storage. Hidden when empty or switched off. */
export function RemindersCard({ applications }: { applications: Application[] }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => { loadReminderSettings().then(setSettings).catch(() => undefined); }, []);
  if (!settings.inApp) return null;
  const reminders: Reminder[] = computeReminders(applications, settings, todayLocal()).slice(0, 6);
  if (!reminders.length) return null;
  return (
    <section aria-label="Erinnerungen" data-testid="reminders">
      <h2 className="text-heading flex items-center gap-2"><BellRing size={19} strokeWidth={2.2} className="text-[var(--coral)]" aria-hidden />Erinnerungen</h2>
      <p className="mt-1 text-sm text-muted">Das solltest du als Nächstes anschauen.</p>
      <ul className="rows mt-2">
        {reminders.map((r) => (
          <li key={r.key}>
            <Link href={`/applications/${r.applicationId}`} className="row-link">
              <span className={`shrink-0 ${r.tone === "danger" ? "text-[var(--danger-fg)]" : "text-[var(--brand)]"}`}>
                {r.kind === "deadline" ? <CalendarClock size={20} strokeWidth={2} /> : <Hourglass size={20} strokeWidth={2} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{r.title}</span>
                <span className="block truncate text-sm text-muted">{r.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
