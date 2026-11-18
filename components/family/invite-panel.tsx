"use client";

import { useId, useState, type FormEvent } from "react";
import { Hourglass, KeyRound, Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/teacher/shared";
import { clearPendingInvite, readPendingInviteEntry } from "@/components/friends/shared";
import { createInvite, joinFamily } from "@/lib/family";
import { FAMILY_COPY, fill } from "@/lib/family-copy";
import { familyError, formatDateCh, formatInviteCode, inviteLink, inviteShareText, isAlreadyInFamily, isValidInviteCode, normalizeInviteCode, type InviteDirection } from "@/lib/family-core";

export type InviteInfo = { code: string; expiresAt: string | null };

const TEXT: Record<InviteDirection, { title: string; intro: string; button: string; waiting: string; validity: (date: string) => string }> = {
  parent_invites_child: {
    title: "Kind einladen", intro: FAMILY_COPY.step2.text, button: FAMILY_COPY.step2.cta, waiting: FAMILY_COPY.step2.waiting,
    validity: (date) => fill(FAMILY_COPY.step2.validUntil, { date }),
  },
  child_invites_parent: {
    title: "Elternteil einladen", intro: FAMILY_COPY.child.connectText, button: FAMILY_COPY.child.connectCta, waiting: FAMILY_COPY.child.waiting,
    validity: (date) => fill(FAMILY_COPY.child.linkNote, { date }),
  },
};

/**
 * Creates a single-use 8-character invite (valid 7 days): code, link (with ?fuer=eltern|kind), copy buttons and the native
 * share sheet where available. `initialInvite` shows an invite that is still open (family_get_my.invites) without a new RPC call.
 * `primary` marks the create button as the page's single primary action (data-primary-action); `false` renders it secondary.
 * `onError` lets the parent intercept an error (return true = handled, e.g. the birth-year gate).
 */
export function InvitePanel({ direction, disabled, disabledReason, initialInvite = null, onCreated, primary, hideTitle = false, onError }: {
  direction: InviteDirection; disabled?: boolean; disabledReason?: string;
  initialInvite?: InviteInfo | null; onCreated?: (invite: InviteInfo) => void; primary?: boolean; hideTitle?: boolean;
  onError?: (error: unknown, retry: () => Promise<void>) => boolean;
}) {
  const [created, setCreated] = useState<InviteInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingId = useId();
  const invite = created ?? initialInvite;
  const t = TEXT[direction];
  const child = direction === "child_invites_parent";
  const link = invite && typeof window !== "undefined" ? inviteLink(window.location.origin, invite.code, direction) : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function create() {
    setBusy(true); setError("");
    try { const next = await createInvite(direction); setCreated(next); onCreated?.(next); }
    catch (e) { if (!onError?.(e, create)) setError(familyError(e)); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!invite) return;
    try { await navigator.share({ title: "Einladung zu WendApply", text: inviteShareText(direction, invite.code, link) }); } catch { /* dismissed */ }
  }

  return (
    <section aria-labelledby={hideTitle ? undefined : headingId} aria-label={hideTitle ? t.title : undefined} className="panel-flat space-y-3 p-5" data-invite-direction={direction}>
      {!hideTitle && <h2 id={headingId} className="text-heading"><UserPlus size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{t.title}</h2>}
      {!hideTitle && <p className="text-body text-muted">{t.intro}</p>}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {disabled ? <StatusMessage tone="info">{disabledReason}</StatusMessage> : invite ? (
        <div className="space-y-3">
          <p className="text-sm">{child ? "Code" : FAMILY_COPY.step2.codeLabel} <span className="sr-only">{invite.code.split("").join(" ")}</span><strong aria-hidden data-testid="invite-code" className="block whitespace-nowrap font-display text-2xl tracking-[.12em]">{formatInviteCode(invite.code)}</strong></p>
          {invite.expiresAt && <p className="text-small text-muted">{t.validity(formatDateCh(invite.expiresAt))}</p>}
          <p className="break-all rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2 text-small" data-testid="invite-link">{link}</p>
          <div className="flex flex-wrap gap-2">
            {child && canShare && <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={share} icon={<Share2 size={14} />}>{FAMILY_COPY.child.shareCta}</Button>}
            <CopyButton text={link} label={FAMILY_COPY.child.copyLink} />
            <CopyButton text={invite.code} label={FAMILY_COPY.child.copyCode} />
            {!child && canShare && <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={share} icon={<Share2 size={14} />}>Teilen</Button>}
          </div>
          <p data-invite-waiting className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--info-bg)] px-3 py-2 text-small text-[var(--info-fg)]" role="status">
            <Hourglass size={15} aria-hidden className="mt-0.5 shrink-0" /><span>{t.waiting}</span>
          </p>
          {!child && <p className="text-small text-muted">{FAMILY_COPY.step2.noAccount}</p>}
          <Button size="sm" variant="ghost" onClick={create} disabled={busy}>{FAMILY_COPY.step2.newCode}</Button>
        </div>
      ) : (
        <Button onClick={create} loading={busy} variant={primary === false ? "secondary" : "primary"} icon={<KeyRound size={16} />} {...(primary ? { "data-primary-action": "" } : {})}>{t.button}</Button>
      )}
    </section>
  );
}

/**
 * Enter an 8-character family code (from a parent or a child). `onAlreadyInFamily(code)` is called instead of showing an error
 * when the server answers ALREADY_IN_FAMILY (the caller can offer the empty-family switch, S9).
 */
export function JoinForm({ initialCode = "", onJoined, title = "Code eingeben", intro, primary, submitLabel = FAMILY_COPY.child.joinCta, label = "Familien-Code", onAlreadyInFamily, bare = false }: {
  initialCode?: string; onJoined: () => void; title?: string; intro?: string;
  primary?: boolean; submitLabel?: string; label?: string; onAlreadyInFamily?: (code: string) => void;
  /** Without the panel frame and heading (inside a collapsible section). */
  bare?: boolean;
}) {
  const [code, setCode] = useState(normalizeInviteCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingId = useId();
  const inputId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidInviteCode(code)) { setError(FAMILY_COPY.join.invalidFormat); return; }
    setBusy(true); setError("");
    const clean = normalizeInviteCode(code);
    try {
      await joinFamily(clean);
      if (readPendingInviteEntry()?.kind === "family") clearPendingInvite();
      onJoined();
    } catch (e) {
      setBusy(false);
      if (onAlreadyInFamily && isAlreadyInFamily(e)) { onAlreadyInFamily(clean); return; }
      setError(familyError(e));
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby={bare ? undefined : headingId} className={bare ? "space-y-3" : "panel-flat space-y-3 p-5"} noValidate data-testid="join-form">
      {!bare && <h2 id={headingId} className="text-heading"><KeyRound size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{title}</h2>}
      {intro && <p className="text-body text-muted">{intro}</p>}
      <Field label={label} htmlFor={inputId} error={error || undefined}>
        <Input id={inputId} enterKeyHint="go" value={formatInviteCode(code)} onChange={(e) => setCode(normalizeInviteCode(e.target.value))} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={FAMILY_COPY.join.placeholder} className="font-display text-lg tracking-[.12em]" />
      </Field>
      <Button type="submit" loading={busy} variant={primary === false ? "secondary" : "primary"} {...(primary ? { "data-primary-action": "" } : {})}>{submitLabel}</Button>
    </form>
  );
}
