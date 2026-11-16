"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/teacher/shared";
import { createInvite, joinFamily } from "@/lib/family";
import { familyError, formatDateCh, formatInviteCode, inviteLink, inviteShareText, isValidInviteCode, normalizeInviteCode, type InviteDirection } from "@/lib/family-core";

const TEXT: Record<InviteDirection, { title: string; intro: string; button: string }> = {
  parent_invites_child: { title: "Kind einladen", intro: "Erstelle einen Code und gib ihn deinem Kind. Es gibt ihn in WendApply unter «Familie» ein oder öffnet den Link.", button: "Einladungscode erstellen" },
  child_invites_parent: { title: "Elternteil einladen", intro: "Erstelle einen Code für deine Mutter, deinen Vater oder eine andere erziehungsberechtigte Person. Sie braucht ein eigenes WendApply-Konto als Elternteil.", button: "Code für Eltern erstellen" },
};

/** Creates a single-use 8-character invite (valid 7 days): code, link, copy buttons and the native share sheet where available. */
export function InvitePanel({ direction, disabled, disabledReason }: { direction: InviteDirection; disabled?: boolean; disabledReason?: string }) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = TEXT[direction];
  const link = invite && typeof window !== "undefined" ? inviteLink(window.location.origin, invite.code) : "";

  async function create() {
    setBusy(true); setError("");
    try { setInvite(await createInvite(direction)); } catch (e) { setError(familyError(e)); } finally { setBusy(false); }
  }
  async function share() {
    if (!invite) return;
    try { await navigator.share({ title: "Einladung zu WendApply", text: inviteShareText(direction, invite.code, link) }); } catch { /* dismissed */ }
  }

  return (
    <section aria-labelledby={`invite-${direction}`} className="panel-flat space-y-3 p-5">
      <h2 id={`invite-${direction}`} className="text-heading"><UserPlus size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{t.title}</h2>
      <p className="text-body text-muted">{t.intro}</p>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {disabled ? <StatusMessage tone="info">{disabledReason}</StatusMessage> : invite ? (
        <div className="space-y-3">
          <p className="text-sm">Code <span className="sr-only">{invite.code.split("").join(" ")}</span><strong aria-hidden data-testid="invite-code" className="ml-1 font-display text-2xl tracking-[.12em]">{formatInviteCode(invite.code)}</strong></p>
          {invite.expiresAt && <p className="text-small text-muted">Gültig bis {formatDateCh(invite.expiresAt)}, nur einmal verwendbar.</p>}
          <p className="break-all rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2 text-small">{link}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={invite.code} label="Code kopieren" />
            <CopyButton text={link} label="Link kopieren" />
            {typeof navigator !== "undefined" && "share" in navigator && <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={share} icon={<Share2 size={14} />}>Teilen</Button>}
          </div>
          <Button size="sm" variant="ghost" onClick={create} disabled={busy}>Neuen Code erstellen</Button>
        </div>
      ) : (
        <Button onClick={create} loading={busy} icon={<KeyRound size={16} />}>{t.button}</Button>
      )}
    </section>
  );
}

/** Enter an 8-character family code (from a parent or a child). */
export function JoinForm({ initialCode = "", onJoined, title = "Code eingeben", intro }: { initialCode?: string; onJoined: () => void; title?: string; intro?: string }) {
  const [code, setCode] = useState(normalizeInviteCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidInviteCode(code)) { setError("Der Code hat 8 Zeichen (Buchstaben und Zahlen)."); return; }
    setBusy(true); setError("");
    try { await joinFamily(normalizeInviteCode(code)); onJoined(); } catch (e) { setError(familyError(e)); setBusy(false); }
  }

  return (
    <form onSubmit={submit} aria-labelledby="join-family" className="panel-flat space-y-3 p-5" noValidate>
      <h2 id="join-family" className="text-heading"><KeyRound size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{title}</h2>
      {intro && <p className="text-body text-muted">{intro}</p>}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <Field label="Familien-Code" htmlFor="family-code">
        <Input id="family-code" value={formatInviteCode(code)} onChange={(e) => setCode(normalizeInviteCode(e.target.value))} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCD 1234" className="font-display text-lg tracking-[.12em]" />
      </Field>
      <Button type="submit" loading={busy}>Familie beitreten</Button>
    </form>
  );
}
