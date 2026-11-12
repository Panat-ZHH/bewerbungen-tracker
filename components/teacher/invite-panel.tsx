"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, FileUp, Link2, Mail, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { classInviteLink } from "@/lib/classes";
import { CODE_CHIP, TABLE_HEAD, formatDate } from "@/components/classes/shared";
import { createInvite, listInvites, revokeInvite, type ClassInvitation, type DashboardClass } from "./api";
import { createInvitesDetailed, type InviteResult } from "@/lib/teacher-more";
import { MAX_IMPORT_ROWS, OUTCOME_LABEL, parseInviteCsv, summarizeOutcomes, type ImportRow, type InviteOutcome } from "@/lib/teacher-extras";
import { INVITE_STATE_LABEL, inviteMailto, inviteState, inviteUrl, type InviteState } from "./logic";
import { QrCode } from "./qr-code";
import { CopyButton, ErrorBanner, teacherError } from "./shared";

// A revoked link is a normal outcome, not an error: calm tone.
const STATE_TONE: Record<InviteState, "success" | "neutral" | "warning"> = { active: "success", used: "neutral", expired: "warning", revoked: "neutral" };

export function InvitePanel({ cls }: { cls: DashboardClass }) {
  const [invites, setInvites] = useState<ClassInvitation[] | null>(null);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState<"" | "many" | "single">("");
  const [formError, setFormError] = useState("");
  const [results, setResults] = useState<(InviteResult & { name: string; url: string | null })[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = classInviteLink(cls.joinCode, origin);

  const load = useCallback(() => { listInvites(cls.id).then((l) => { setInvites(l); setError(""); }).catch((e) => setError(teacherError(e))); }, [cls.id]);
  useEffect(() => { load(); }, [load]);

  const parsed = useMemo(() => parseInviteCsv(emails), [emails]);
  const okRows = parsed.rows.filter((r) => r.status === "ok");
  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 512_000) { setFormError("Die Datei ist zu gross (maximal 500 KB)."); return; }
    setFormError(""); setResults(null); setEmails(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }
  async function sendMany() {
    setFormError("");
    if (okRows.length === 0) { setFormError("Bitte gib mindestens eine gültige E-Mail-Adresse ein."); return; }
    setBusy("many");
    try {
      const names = new Map(okRows.map((r) => [r.email, r.name]));
      const out = await createInvitesDetailed(cls.id, okRows.map((r) => r.email));
      // Rows rejected on the client are reported together with the server verdicts, so every input line has one visible result.
      const local = parsed.rows.filter((r) => r.status !== "ok").map((r): InviteResult => ({ email: r.email || "(leer)", outcome: r.status === "duplicate" ? "duplicate" : "invalid", token: null }));
      setResults([...out, ...local].map((r) => ({ ...r, name: names.get(r.email) ?? "", url: r.token ? inviteUrl(r.token, origin) : null })));
      setEmails("");
      const sum = summarizeOutcomes([...out, ...local]);
      toast({ message: sum.text + ".", tone: sum.created ? "success" : "info" });
      load();
    } catch (e) { setFormError(teacherError(e)); } finally { setBusy(""); }
  }
  async function createLink() {
    setBusy("single");
    try { const inv = await createInvite(cls.id); await navigator.clipboard?.writeText(inviteUrl(inv.token, origin)).catch(() => undefined); toast({ message: "Einladungslink erstellt und kopiert (14 Tage gültig).", tone: "success" }); load(); }
    catch (e) { setError(teacherError(e)); } finally { setBusy(""); }
  }
  async function revoke(inv: ClassInvitation) {
    try { await revokeInvite(inv.id); toast({ message: "Einladung widerrufen.", tone: "success" }); load(); } catch (e) { setError(teacherError(e)); }
  }

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card className="h-fit min-w-0 space-y-4 p-4 sm:p-5">
        <div><h2 className="text-heading">Klassen-Link und Code</h2><p className="text-small mt-1 text-muted">Wer den Link oder Code hat, kann der Klasse beitreten. Teile ihn nur mit deiner Klasse.</p></div>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <QrCode value={joinLink} label={`QR-Code zum Beitritt der Klasse ${cls.name}`} />
          <div className="w-full min-w-0 space-y-4">
            <div><p className="mb-1.5 text-sm font-bold">Code</p><div className="flex flex-wrap items-center gap-2"><code className={CODE_CHIP}>{cls.joinCode}</code><CopyButton text={cls.joinCode} label="Code kopieren" /></div></div>
            <div><p className="mb-1 text-sm font-bold">Link</p><p className="text-small select-all break-all text-muted">{joinLink}</p><div className="mt-2"><CopyButton text={joinLink} label="Link kopieren" /></div></div>
          </div>
        </div>
        <p className="text-small border-t-[1.5px] border-dashed border-[var(--line)] pt-3 text-muted">Den Code änderst du in den Einstellungen. Dann funktioniert der alte Link nicht mehr.</p>
      </Card>

      <section className="min-w-0 space-y-4">
        <div><h2 className="text-heading">Per E-Mail einladen</h2><p className="text-small mt-1 text-muted">Füge Adressen ein oder lade eine Klassenliste als CSV-Datei («Name, E-Mail», Kopfzeile optional). Jede Person erhält einen persönlichen Link, der nur mit dieser E-Mail-Adresse funktioniert. Es wird keine E-Mail automatisch versendet; du verschickst die Links selbst.</p></div>
        <Field label="Adressen oder Klassenliste" htmlFor="inv-emails" error={formError} hint={`Maximal ${MAX_IMPORT_ROWS} Adressen auf einmal`}>
          <Textarea id="inv-emails" rows={5} className="text-base! sm:text-base!" value={emails} onChange={(e) => { setEmails(e.target.value); setResults(null); }} placeholder={"Anna Muster, anna@schule.ch\nBen Beispiel, ben@schule.ch"} aria-invalid={!!formError} />
        </Field>
        <input ref={fileRef} id="inv-file" type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void loadFile(e.target.files?.[0])} />
        {parsed.rows.length > 0 && <ImportPreview rows={parsed.rows} counts={parsed.counts} />}
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 sm:min-h-11" icon={<Send size={15} />} loading={busy === "many"} disabled={okRows.length === 0} onClick={sendMany}>{okRows.length > 0 ? `${okRows.length} ${okRows.length === 1 ? "Einladung" : "Einladungen"} erstellen` : "Einladungen erstellen"}</Button>
          <Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>CSV-Datei laden</Button>
          <Button variant="ghost" className="min-h-11 sm:min-h-11" icon={<Plus size={15} />} loading={busy === "single"} onClick={createLink}>Offenen Link erstellen</Button>
        </div>
        {results && <InviteResults results={results} className={cls.name} />}
      </section>

      <section className="min-w-0 lg:col-span-2">
        <h2 className="text-heading">Einladungen</h2>
        {error && <div className="mt-3"><ErrorBanner message={error} onRetry={load} /></div>}
        {!invites && !error && <Skeleton className="mt-3 h-16 rounded-[var(--radius-md)]" />}
        {invites && invites.length === 0 && <p className="text-small mt-2 flex items-center gap-2 text-muted"><Link2 size={16} aria-hidden /> Noch keine persönlichen Einladungen erstellt.</p>}
        {invites && invites.length > 0 && (
          <ul className="rows mt-2 border-y-[length:var(--border-w)] border-[var(--outline)]">
            {invites.map((inv) => {
              const state = inviteState(inv); const url = inviteUrl(inv.token, origin);
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{inv.email ?? "Offener Link"}</p><p className="text-small tabular text-muted">Gültig bis {formatDate(inv.expiresAt)} · {inv.uses}{inv.maxUses !== null ? `/${inv.maxUses}` : ""} Beitritte</p></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATE_TONE[state]}>{INVITE_STATE_LABEL[state]}</Badge>
                    {state === "active" && <CopyButton text={url} label="Link" variant="ghost" />}
                    {state === "active" && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" icon={<Ban size={14} />} aria-label={`Einladung für ${inv.email ?? "offenen Link"} widerrufen`} onClick={() => revoke(inv)}>Widerrufen</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const ROW_TONE: Record<ImportRow["status"], "success" | "danger" | "neutral"> = { ok: "success", invalid: "danger", duplicate: "neutral" };
const ROW_LABEL: Record<ImportRow["status"], string> = { ok: "Gültig", invalid: "Ungültig", duplicate: "Doppelt" };

/** Preview of the parsed list before anything is created: every line with its verdict, plus counts. */
function ImportPreview({ rows, counts }: { rows: ImportRow[]; counts: { ok: number; invalid: number; duplicate: number; total: number } }) {
  return (
    <div className="space-y-2" aria-label="Vorschau der Liste">
      <p className="text-sm font-semibold" role="status">{counts.total} {counts.total === 1 ? "Zeile" : "Zeilen"}: {counts.ok} gültig{counts.duplicate ? `, ${counts.duplicate} doppelt` : ""}{counts.invalid ? `, ${counts.invalid} ungültig` : ""}</p>
      <div className="panel-flat max-h-56 overflow-auto rounded-[var(--radius-md)]">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Vorschau der Einladungsliste</caption>
          <thead className={`${TABLE_HEAD} sticky top-0 bg-[var(--surface)] shadow-[0_1.5px_0_var(--outline)]`}><tr><th scope="col" className="px-3 py-2">Name</th><th scope="col" className="px-3 py-2">E-Mail</th><th scope="col" className="px-3 py-2">Prüfung</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={`${r.line}-${i}`} className="border-t-[1.5px] border-dashed border-[var(--line)] first:border-0">
              <td className="max-w-[9rem] truncate px-3 py-2">{r.name || <span className="text-muted">–</span>}</td>
              <td className="max-w-[12rem] truncate px-3 py-2">{r.email || <span className="text-muted">–</span>}</td>
              <td className="px-3 py-2"><Badge tone={ROW_TONE[r.status]}>{ROW_LABEL[r.status]}</Badge>{r.reason && <span className="text-small ml-2 text-muted">{r.reason}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

const OUTCOME_TONE: Record<string, "success" | "danger" | "neutral" | "warning"> = { created: "success", already_invited: "warning", already_member: "neutral", duplicate: "neutral", invalid: "danger" };
/** Result after sending: one line per address (created / already invited / already member / duplicate / invalid) and the totals. */
function InviteResults({ results, className }: { results: (InviteResult & { name: string; url: string | null })[]; className: string }) {
  const sum = summarizeOutcomes(results);
  const links = results.filter((r) => r.url);
  return (
    <div className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--success-bg)] p-4" role="status">
      <p className="text-sm font-bold text-[var(--success-fg)]">{sum.text}</p>
      <ul className="rows [&>*+*]:border-[var(--success-line)] [&>*]:py-1.5">{results.map((r, i) => (
        <li key={`${r.email}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 basis-40 truncate text-sm">{r.name ? `${r.name} · ` : ""}{r.email}</span>
          <Badge tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{OUTCOME_LABEL[r.outcome as InviteOutcome] ?? "Übersprungen"}</Badge>
          {r.url && <ButtonLink href={inviteMailto(r.email, className, r.url)} size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" icon={<Mail size={14} />} aria-label={`E-Mail an ${r.email} vorbereiten`}>E-Mail</ButtonLink>}
        </li>
      ))}</ul>
      {links.length > 0 && <CopyButton text={links.map((r) => `${r.name ? `${r.name} · ` : ""}${r.email}: ${r.url}`).join("\n")} label="Alle Links kopieren" />}
    </div>
  );
}
