"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { DEFAULT_SETTINGS, type ReminderSettings } from "@/lib/reminders";
import { createFeed, disablePush, enablePush, feedUrl, listFeeds, loadReminderSettings, pushSupported, revokeFeed, saveReminderSettings, type Feed } from "@/lib/reminders-client";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import { SettingsSection } from "./section";

function Row({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
      <input id={id} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
    </label>
  );
}

/** Drop-in replacement for the slot component of the same name (components/settings/notification-slot.tsx, part b). */
export function NotificationSettings() {
  const [s, setS] = useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    Promise.all([loadReminderSettings(), listFeeds()])
      .then(([settings, feeds]) => { setS(settings); setFeed(feeds.find((f) => f.applicationId === null) ?? null); })
      .catch((reason) => setNote({ tone: "danger", text: friendlyMessage(reason, "Die Einstellungen konnten nicht geladen werden.") }))
      .finally(() => setLoaded(true));
  }, []);

  async function update(next: ReminderSettings) {
    const prev = s; setS(next); setNote(null);
    try { await saveReminderSettings(next); }
    catch (reason) { setS(prev); setNote({ tone: "danger", text: friendlyMessage(reason, "Das konnte nicht gespeichert werden.") }); }
  }
  async function togglePush(on: boolean) {
    if (!on) { await disablePush(); return update({ ...s, push: false }); }
    try {
      const r = await enablePush();
      if (r === "ok") return update({ ...s, push: true });
      setNote({ tone: "danger", text: r === "denied" ? "Dein Browser blockiert Mitteilungen. Erlaube sie in den Browser-Einstellungen für diese Seite." : r === "unsupported" ? "Dieser Browser kann keine Mitteilungen anzeigen. Auf dem iPhone: zuerst «Zum Home-Bildschirm» hinzufügen." : "Mitteilungen sind auf diesem Server noch nicht eingerichtet." });
    } catch (reason) { setNote({ tone: "danger", text: friendlyMessage(reason, "Mitteilungen konnten nicht aktiviert werden.") }); }
  }

  return (
    <SettingsSection data-testid="notification-settings" title="Benachrichtigungen" description="WendApply erinnert dich an Fristen und daran, nachzufragen, wenn lange nichts passiert ist.">
      {note && <StatusMessage tone={note.tone} className="mb-3"><p>{note.text}</p></StatusMessage>}
      <div className="rows">
        <Row id="rem-inapp" label="Im Start-Bereich anzeigen" hint="Die Karte «Erinnerungen» auf deiner Startseite." checked={s.inApp} disabled={!loaded} onChange={(v) => update({ ...s, inApp: v })} />
        <Row id="rem-mail" label="Täglich per E-Mail" hint="Eine Mail am Morgen, nur wenn etwas ansteht." checked={s.email} disabled={!loaded} onChange={(v) => update({ ...s, email: v })} />
        <Row id="rem-push" label="Mitteilung auf diesem Gerät" hint={pushSupported() ? "Eine Push-Mitteilung, auch wenn WendApply geschlossen ist." : "Auf diesem Gerät nicht verfügbar."} checked={s.push} onChange={togglePush} disabled={!loaded || !pushSupported()} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Frist-Erinnerung ab
          <Select className="mt-1.5 block font-normal" value={s.daysBefore} disabled={!loaded} onChange={(e) => update({ ...s, daysBefore: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7, 14].map((n) => <option key={n} value={n}>{n === 0 ? "am Tag der Frist" : n === 1 ? "1 Tag vorher" : `${n} Tage vorher`}</option>)}
          </Select>
        </label>
        <label className="text-sm font-semibold">«Kein Update» nach
          <Select className="mt-1.5 block font-normal" value={s.staleDays} disabled={!loaded} onChange={(e) => update({ ...s, staleDays: Number(e.target.value) })}>
            {[7, 10, 14, 21, 30].map((n) => <option key={n} value={n}>{n} Tagen</option>)}
          </Select>
        </label>
      </div>
      <div className="mt-6">
        <h3 className="text-[15px] font-bold">Kalender-Abo für alle Fristen</h3>
        <p className="mt-1 text-sm text-muted">Mit diesem Link zeigt dein Kalender (Apple, Google, Outlook) alle deine Fristen. Wer den Link kennt, sieht diese Fristen – widerrufe ihn, wenn du ihn nicht mehr brauchst.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!feed ? (
            <Button size="sm" variant="secondary" icon={<Link2 size={15} />} disabled={!loaded} onClick={() => createFeed(null).then(setFeed).catch((r) => setNote({ tone: "danger", text: friendlyMessage(r, "Der Link konnte nicht erstellt werden.") }))}>Link erstellen</Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" icon={<Copy size={15} />} onClick={() => navigator.clipboard.writeText(feedUrl(feed.token)).then(() => toast({ message: "Link kopiert.", tone: "success" }))}>Link kopieren</Button>
              <Button size="sm" variant="ghost" icon={<Link2Off size={15} />} onClick={() => revokeFeed(feed.id).then(() => setFeed(null)).catch((r) => setNote({ tone: "danger", text: friendlyMessage(r, "Der Link konnte nicht widerrufen werden.") }))}>Link widerrufen</Button>
            </>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
