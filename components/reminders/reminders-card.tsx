"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarClock, Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";
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
    <section className="mt-10" aria-label="Erinnerungen" data-testid="reminders">
      <div className="flex items-center gap-2">
        <BellRing size={18} className="text-[var(--brand)]" />
        <h2 className="text-xl font-semibold tracking-[-.4px]">Erinnerungen</h2>
      </div>
      <p className="mt-1 text-sm text-muted">Das solltest du als Nächstes anschauen.</p>
      <ul className="mt-4 space-y-2.5">
        {reminders.map((r) => (
          <li key={r.key}>
            <Link href={`/applications/${r.applicationId}`} className="block">
              <Card className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition hover:shadow-[var(--shadow-sm)]">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${r.tone === "danger" ? "bg-[var(--danger-bg)] text-[var(--danger-fg)]" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}>
                  {r.kind === "deadline" ? <CalendarClock size={18} /> : <Hourglass size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{r.title}</span>
                  <span className="block truncate text-sm text-muted">{r.detail}</span>
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
