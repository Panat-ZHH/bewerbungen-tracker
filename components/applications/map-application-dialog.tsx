"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, MapPin, Save, X } from "lucide-react";
import { updateApplication } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import styles from "@/app/map/map.module.css";

export function MapApplicationDialog({ application, onClose, onUpdated }: { application: Application; onClose: () => void; onUpdated: (application: Application) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [draft, setDraft] = useState(application.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function save() {
    if (saving.current || draft === application.status) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const updated = await updateApplication(application.id, { status: draft });
      if (!updated) throw new Error("Application no longer exists");
      onUpdated(updated);
      setSaved(true);
    } catch {
      setError("Der Status konnte nicht gespeichert werden. Bitte versuche es erneut.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function date(value: string) {
    const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "Unbekannt" : parsed.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
  }

  return (
    <dialog ref={dialog} className={styles.applicationDialog} aria-labelledby="map-application-title" onClose={onClose} onCancel={(event) => { if (saving.current) event.preventDefault(); }} onClick={(event) => { if (event.target === event.currentTarget && !saving.current) dialog.current?.close(); }}>
      <div className={styles.dialogHeader}>
        <div><p className={styles.dialogCompany}>{application.company}</p><h2 id="map-application-title">{application.position}</h2></div>
        <button type="button" title="Schließen" aria-label="Schließen" disabled={busy} onClick={() => dialog.current?.close()}><X size={20} /></button>
      </div>
      <div className={styles.dialogBody}>
        <p className={styles.currentStatus}>{statusLabels[application.status]}</p>
        {application.location && <p className={styles.dialogMeta}><MapPin size={16} />{application.location}</p>}
        <dl className={styles.dialogDates}>
          <div><dt><CalendarDays size={15} /> Letzte Änderung</dt><dd><time dateTime={application.updatedAt}>{date(application.updatedAt)}</time></dd></div>
          <div><dt>Erfasst am</dt><dd><time dateTime={application.createdAt}>{date(application.createdAt)}</time></dd></div>
          {application.appliedAt && <div><dt>Abgeschickt am</dt><dd><time dateTime={application.appliedAt}>{date(application.appliedAt)}</time></dd></div>}
          {application.deadline && <div><dt>Bewerbungsfrist</dt><dd><time dateTime={application.deadline}>{date(application.deadline)}</time></dd></div>}
        </dl>
        {application.notes && <div className={styles.dialogNotes}><h3>Deine Notizen</h3><p>{application.notes}</p></div>}
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label htmlFor="map-application-status">Status ändern</label>
          <select id="map-application-status" value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value as ApplicationStatus); setSaved(false); setError(""); }}>
            {(Object.entries(statusLabels) as [ApplicationStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {error && <p className={styles.dialogError} role="alert">{error}</p>}
          <p className={styles.saveNotice} role="status">{busy ? "Wird gespeichert ..." : saved ? <><Check size={16} /> Status gespeichert</> : ""}</p>
          <button type="submit" className={styles.saveButton} disabled={busy || draft === application.status}><Save size={16} />{busy ? "Speichern ..." : "Status speichern"}</button>
        </form>
      </div>
      <footer className={styles.dialogFooter}><Link href={`/applications/${encodeURIComponent(application.id)}`}><ArrowUpRight size={16} /> Bewerbung öffnen</Link></footer>
    </dialog>
  );
}