"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, LocateFixed, MapPin, Save } from "lucide-react";
import { updateApplication } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import { MapSheet } from "./map-fullscreen";
import styles from "@/app/map/map.module.css";

/** Details of the selected building as a bottom sheet (phones) / side card (from 768px). Kept under its old name for the page import. */
export function MapApplicationDialog({ application, onClose, onUpdated, onMove, canMove }: { application: Application; onClose: () => void; onUpdated: (application: Application) => void; onMove: () => void; canMove: boolean }) {
  const saving = useRef(false);
  const [draft, setDraft] = useState(application.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

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
    <MapSheet id="application" open onClose={onClose} title={application.position} subtitle={application.company} closeDisabled={busy}>
      <p className={styles.sheetStatus}>{statusLabels[application.status]}</p>
      {application.location && <p className={styles.sheetMeta}><MapPin size={16} aria-hidden />{application.location}</p>}
      <dl className={styles.sheetDates}>
        <div><dt><CalendarDays size={15} aria-hidden /> Letzte Änderung</dt><dd><time dateTime={application.updatedAt}>{date(application.updatedAt)}</time></dd></div>
        <div><dt>Erfasst am</dt><dd><time dateTime={application.createdAt}>{date(application.createdAt)}</time></dd></div>
        {application.appliedAt && <div><dt>Abgeschickt am</dt><dd><time dateTime={application.appliedAt}>{date(application.appliedAt)}</time></dd></div>}
        {application.deadline && <div><dt>Bewerbungsfrist</dt><dd><time dateTime={application.deadline}>{date(application.deadline)}</time></dd></div>}
      </dl>
      {application.notes && <div className={styles.sheetNotes}><h3>Deine Notizen</h3><p>{application.notes}</p></div>}
      <form className={styles.sheetForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor="map-application-status">Status ändern</label>
        <select id="map-application-status" value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value as ApplicationStatus); setSaved(false); setError(""); }}>
          {(Object.entries(statusLabels) as [ApplicationStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        <p className={styles.saveNotice} role="status">{busy ? "Wird gespeichert ..." : saved ? <><Check size={16} aria-hidden /> Status gespeichert</> : ""}</p>
        <button type="submit" className={styles.saveButton} disabled={busy || draft === application.status}><Save size={16} aria-hidden />{busy ? "Speichern ..." : "Status speichern"}</button>
      </form>
      <div className={styles.sheetActions}>
        <button type="button" disabled={busy || !canMove} onClick={onMove}><LocateFixed size={16} aria-hidden />Haus verschieben</button>
        <Link href={`/applications/${encodeURIComponent(application.id)}`}><ArrowUpRight size={16} aria-hidden /> Bewerbung öffnen</Link>
      </div>
    </MapSheet>
  );
}
