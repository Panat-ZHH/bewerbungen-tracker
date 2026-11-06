"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Link2, Mail, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { classInviteLink } from "@/lib/classes";
import { formatDate } from "@/components/classes/shared";
import { createInvite, createInvites, listInvites, revokeInvite, type ClassInvitation, type DashboardClass } from "./api";
import { INVITE_STATE_LABEL, MAX_INVITE_EMAILS, inviteMailto, inviteState, inviteUrl, parseEmails, type InviteState } from "./logic";
import { QrCode } from "./qr-code";
import { CopyButton, ErrorBanner, teacherError } from "./shared";

const STATE_TONE: Record<InviteState, "success" | "neutral" | "warning" | "danger"> = { active: "success", used: "neutral", expired: "warning", revoked: "danger" };

export function InvitePanel({ cls }: { cls: DashboardClass }) {
  const [invites, setInvites] = useState<ClassInvitation[] | null>(null);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState<"" | "many" | "single">("");
  const [formError, setFormError] = useState("");
  const [results, setResults] = useState<{ email: string; url: string }[]>([]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = classInviteLink(cls.joinCode, origin);

  const load = useCallback(() => { listInvites(cls.id).then((l) => { setInvites(l); setError(""); }).catch((e) => setError(teacherError(e))); }, [cls.id]);
  useEffect(() => { load(); }, [load]);

  const parsed = parseEmails(emails);
  async function sendMany() {
    setFormError("");
    if (parsed.valid.length === 0) { setFormError("Bitte gib mindestens eine gültige E-Mail-Adresse ein."); return; }
    if (parsed.valid.length > MAX_INVITE_EMAILS) { setFormError(`Maximal ${MAX_INVITE_EMAILS} Adressen auf einmal (aktuell ${parsed.valid.length}).`); return; }
    setBusy("many");
    try {
      const created = await createInvites(cls.id, parsed.valid);
      setResults(created.map((c) => ({ email: c.email, url: inviteUrl(c.token, origin) })));
      setEmails(parsed.invalid.join("\n"));
      toast({ message: `${created.length} Einladungen erstellt.`, tone: "success" });
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
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div><h2 className="text-heading">Klassen-Link und Code</h2><p className="text-small text-muted">Wer den Link oder Code hat, kann der Klasse beitreten. Teile ihn nur mit deiner Klasse.</p></div>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <QrCode value={joinLink} label={`QR-Code zum Beitritt der Klasse ${cls.name}`} />
          <div className="w-full min-w-0 space-y-3">
            <div><p className="text-eyebrow mb-1">Code</p><div className="flex flex-wrap items-center gap-2"><code className="tabular break-all rounded-[var(--radius-md)] border border-[var(--neutral-line)] bg-[var(--neutral-bg)] px-3 py-1.5 text-[15px] font-semibold tracking-[.18em]">{cls.joinCode}</code><CopyButton text={cls.joinCode} label="Code kopieren" /></div></div>
            <div><p className="text-eyebrow mb-1">Link</p><p className="text-small select-all break-all text-muted">{joinLink}</p><div className="mt-2"><CopyButton text={joinLink} label="Link kopieren" /></div></div>
          </div>
        </div>
        <p className="text-small text-muted">Den Code änderst du in den Einstellungen. Dann funktioniert der alte Link nicht mehr.</p>
      </Card>

      <Card className="space-y-4 p-5">
        <div><h2 className="text-heading">Per E-Mail einladen</h2><p className="text-small text-muted">Füge Adressen ein, getrennt durch Komma, Leerzeichen oder Zeilenumbruch. Jede Person erhält einen persönlichen Link, der nur mit dieser E-Mail-Adresse funktioniert.</p></div>
        <Field label="E-Mail-Adressen" htmlFor="inv-emails" error={formError} hint={emails.trim() ? `${parsed.valid.length} gültig${parsed.invalid.length ? `, ${parsed.invalid.length} ungültig (${parsed.invalid.slice(0, 3).join(", ")}${parsed.invalid.length > 3 ? " …" : ""})` : ""}` : `Maximal ${MAX_INVITE_EMAILS} Adressen`}>
          <Textarea id="inv-emails" rows={4} className="text-base! sm:text-base!" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"anna@schule.ch\nben@schule.ch"} aria-invalid={!!formError} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 sm:min-h-11" icon={<Send size={15} />} loading={busy === "many"} onClick={sendMany}>Einladungen erstellen</Button>
          <Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<Plus size={15} />} loading={busy === "single"} onClick={createLink}>Offenen Link erstellen</Button>
        </div>
        {results.length > 0 && (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--success-line)] bg-[var(--success-bg)] p-3" role="status">
            <p className="text-sm font-semibold text-[var(--success-fg)]">{results.length} persönliche Links bereit</p>
            <ul className="space-y-1">{results.map((r) => (
              <li key={r.email} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm">{r.email}</span><ButtonLink href={inviteMailto(r.email, cls.name, r.url)} size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" icon={<Mail size={14} />} aria-label={`E-Mail an ${r.email} vorbereiten`}>E-Mail</ButtonLink></li>
            ))}</ul>
            <CopyButton text={results.map((r) => `${r.email}: ${r.url}`).join("\n")} label="Alle Links kopieren" />
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5 lg:col-span-2">
        <h2 className="text-heading">Einladungen</h2>
        {error && <ErrorBanner message={error} onRetry={load} />}
        {!invites && !error && <Skeleton className="h-16 rounded-[var(--radius-md)]" />}
        {invites && invites.length === 0 && <p className="text-small flex items-center gap-2 text-muted"><Link2 size={16} aria-hidden /> Noch keine persönlichen Einladungen erstellt.</p>}
        {invites && invites.length > 0 && (
          <ul className="divide-y divide-[var(--line)]">
            {invites.map((inv) => {
              const state = inviteState(inv); const url = inviteUrl(inv.token, origin);
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{inv.email ?? "Offener Link"}</p><p className="text-small tabular text-muted">Gültig bis {formatDate(inv.expiresAt)} · {inv.uses}{inv.maxUses !== null ? `/${inv.maxUses}` : ""} Beitritte</p></div>
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
      </Card>
    </div>
  );
}
