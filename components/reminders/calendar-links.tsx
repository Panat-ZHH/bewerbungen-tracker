"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Copy, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildIcs } from "@/lib/reminders";
import { createFeed, feedUrl, listFeeds, revokeFeed, type Feed } from "@/lib/reminders-client";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import type { Application } from "@/types";

/** For the application detail page: .ics download and a revocable calendar subscription link. Renders nothing without a deadline. */
export function CalendarLinks({ application }: { application: Application }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listFeeds().then((all) => setFeed(all.find((f) => f.applicationId === application.id) ?? null)).catch(() => undefined); }, [application.id]);
  if (!application.deadline) return null;
  const deadline = application.deadline;

  function download() {
    const ics = buildIcs([{ id: application.id, company: application.company, position: application.position, location: application.location, jobUrl: application.jobUrl, deadline }]);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "frist.ics"; a.click(); URL.revokeObjectURL(url);
  }
  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    try { await fn(); } catch (reason) { toast({ message: friendlyMessage(reason, fallback), tone: "danger" }); } finally { setBusy(false); }
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="calendar-links">
      <Button size="sm" variant="secondary" icon={<CalendarPlus size={15} />} onClick={download}>Frist im Kalender speichern</Button>
      {!feed ? (
        <Button size="sm" variant="ghost" icon={<Link2 size={15} />} loading={busy} onClick={() => run(async () => setFeed(await createFeed(application.id)), "Der Kalenderlink konnte nicht erstellt werden.")}>Kalender abonnieren</Button>
      ) : (
        <>
          <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={() => navigator.clipboard.writeText(feedUrl(feed.token)).then(() => toast({ message: "Link kopiert. Füge ihn in deinem Kalender als Abo hinzu.", tone: "success" }))}>Link kopieren</Button>
          <Button size="sm" variant="ghost" icon={<Link2Off size={15} />} loading={busy} onClick={() => run(async () => { await revokeFeed(feed.id); setFeed(null); toast({ message: "Der Kalenderlink funktioniert nicht mehr.", tone: "success" }); }, "Der Link konnte nicht widerrufen werden.")}>Link widerrufen</Button>
        </>
      )}
    </div>
  );
}
