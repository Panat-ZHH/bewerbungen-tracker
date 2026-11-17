"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Heart, KeyRound, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/teacher/shared";
import { BirthYearField } from "@/components/onboarding/role-cards";
import { createInvite, getMyFamily, setBirthYear, switchToFamily } from "@/lib/family";
import { FAMILY_COPY, fill } from "@/lib/family-copy";
import {
  ALREADY_IN_FAMILY_TEXT, familyError, formatDateCh, formatInviteCode, inviteLink, inviteShareText, isBirthYearRequired, isEmptyOwnFamily,
  isValidBirthYear, openInvite, parentsOf, type MyFamily,
} from "@/lib/family-core";
import { JoinForm, type InviteInfo } from "./invite-panel";
import { useAccess } from "@/components/access/access-provider";

const DIRECTION = "child_invites_parent" as const;
/** Auto refresh while waiting for the parents (§3.2): every 15 s and when the tab gets focus again. */
const POLL_MS = 15_000;

export type StudentStep = "connect" | "wait" | "joined";

/**
 * Student side without a connected parent (§3.2): one card "Deine Eltern verbinden" with a 2-item checklist.
 * 1) create the link (primary) -> code + "Link teilen"/"Link kopieren" + "Code kopieren", 2) wait for the parents (auto refresh).
 * Secondary, collapsed: "Du hast schon einen Code von deinen Eltern?" -> JoinForm. With an invite link (`initialCode`) the join
 * form is open and primary instead. Birth-year gate when the RPC needs the Jahrgang (BIRTH_YEAR_REQUIRED), then the original
 * action is retried automatically. ALREADY_IN_FAMILY with an empty own family -> switch modal (S9).
 *
 * `family` = the student's own family when it exists but has no parent yet (auto-created by the first invite); then its open
 * invite is shown again after a reload. `onChanged` is called once a parent is connected or the student joined a family.
 */
export function StudentStart({ initialCode = "", onChanged, family = null }: { initialCode: string; onChanged: () => void; family?: MyFamily | null }) {
  const stored = openInvite(family, DIRECTION);
  const [invite, setInvite] = useState<InviteInfo | null>(stored ? { code: stored.code, expiresAt: stored.expiresAt } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gate, setGate] = useState<null | { retry: () => Promise<void> }>(null);
  const [joinOpen, setJoinOpen] = useState(Boolean(initialCode));
  const [switchCode, setSwitchCode] = useState<string | null>(null);
  const createdFamily = useRef(Boolean(family));
  const inviteMode = Boolean(initialCode);
  // Presentation only: pupils covered by their school get no Familienpaket sentence (schueler-13).
  const { access } = useAccess();
  const connectText = access?.reason === "school_licence" ? FAMILY_COPY.child.connectTextSchool : FAMILY_COPY.child.connectText;
  const step: StudentStep = invite ? "wait" : "connect";

  // ---- waiting: poll family_get_my until a parent is in the family
  const check = useCallback(async () => {
    try { const f = await getMyFamily(); if (f && parentsOf(f).length > 0) onChanged(); } catch { /* offline: try again later */ }
  }, [onChanged]);
  useEffect(() => {
    if (!invite) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, POLL_MS);
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [invite, check]);

  // ---- actions (each can hit the birth-year gate and is retried after saving the Jahrgang)
  const handle = (e: unknown, retry: () => Promise<void>) => {
    if (isBirthYearRequired(e)) { setGate({ retry }); return; }
    setError(familyError(e));
  };
  async function create() {
    setBusy(true); setError("");
    try { const next = await createInvite(DIRECTION); createdFamily.current = true; setInvite(next); }
    catch (e) { handle(e, create); }
    finally { setBusy(false); }
  }
  async function confirmSwitch() {
    if (!switchCode) return;
    setBusy(true); setError("");
    try { await switchToFamily(switchCode); setSwitchCode(null); onChanged(); }
    catch (e) { setSwitchCode(null); handle(e, confirmSwitch); }
    finally { setBusy(false); }
  }
  function alreadyInFamily(code: string) {
    // Only an empty own family (just me, no plan) may be dissolved; otherwise the student has to leave on purpose.
    const empty = family ? isEmptyOwnFamily(family) : createdFamily.current;
    if (empty) setSwitchCode(code); else setError(ALREADY_IN_FAMILY_TEXT);
  }

  const link = invite && typeof window !== "undefined" ? inviteLink(window.location.origin, invite.code, DIRECTION) : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  async function share() {
    if (!invite) return;
    try { await navigator.share({ title: "Einladung zu WendApply", text: inviteShareText(DIRECTION, invite.code, link) }); } catch { /* dismissed */ }
  }

  if (gate) return <BirthYearGate onSaved={async () => { const retry = gate.retry; setGate(null); await retry(); }} onCancel={() => setGate(null)} />;

  const joinForm = (
    <JoinForm bare initialCode={initialCode} onJoined={onChanged} primary={inviteMode} title={FAMILY_COPY.child.joinLabel} label={FAMILY_COPY.child.joinLabel}
      submitLabel={FAMILY_COPY.child.joinCta} onAlreadyInFamily={alreadyInFamily} />
  );

  const connectSection = (
      <section aria-labelledby="student-connect" className="panel-flat space-y-4 p-5" data-testid="student-connect">
        <div className="space-y-1">
          <h2 id="student-connect" className="text-heading"><Heart size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{FAMILY_COPY.child.connectTitle}</h2>
          <p className="text-body text-muted">{connectText}</p>
        </div>
        {error && !inviteMode && <StatusMessage tone="danger">{error}</StatusMessage>}

        <ol className="space-y-4" aria-label={FAMILY_COPY.child.connectTitle}>
          <ChecklistItem n={1} done={Boolean(invite)} title={FAMILY_COPY.child.check1}>
            {invite ? (
              <div className="space-y-3">
                <p className="text-sm">Code <span className="sr-only">{invite.code.split("").join(" ")}</span><strong aria-hidden data-testid="invite-code" className="ml-1 font-display text-2xl tracking-[.12em]">{formatInviteCode(invite.code)}</strong></p>
                <p className="break-all rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2 text-small" data-testid="invite-link">{link}</p>
                <div className="flex flex-wrap gap-2">
                  {canShare
                    ? <Button size="sm" variant={inviteMode ? "secondary" : "primary"} className="min-h-11 sm:min-h-11" onClick={share} icon={<Share2 size={14} aria-hidden />} {...(inviteMode ? {} : { "data-primary-action": "" })}>{FAMILY_COPY.child.shareCta}</Button>
                    : <PrimaryCopy text={link} primary={!inviteMode} />}
                  {canShare && <CopyButton text={link} label={FAMILY_COPY.child.copyLink} />}
                  <CopyButton text={invite.code} label={FAMILY_COPY.child.copyCode} />
                </div>
                {invite.expiresAt && <p className="text-small text-muted">{fill(FAMILY_COPY.child.linkNote, { date: formatDateCh(invite.expiresAt) })}</p>}
              </div>
            ) : (
              <Button onClick={create} loading={busy} variant={inviteMode ? "secondary" : "primary"} icon={<Link2 size={16} aria-hidden />} {...(inviteMode ? {} : { "data-primary-action": "" })}>{FAMILY_COPY.child.connectCta}</Button>
            )}
          </ChecklistItem>
          <ChecklistItem n={2} done={false} current={Boolean(invite)} title={FAMILY_COPY.child.check2}>
            <p className={`text-small ${invite ? "" : "text-muted"}`} {...(invite ? { "data-invite-waiting": "", role: "status" } : {})}>{FAMILY_COPY.child.waiting}</p>
            <p className="text-small text-muted">{FAMILY_COPY.child.under16}</p>
          </ChecklistItem>
        </ol>

        {!inviteMode && (
          <div className="border-t-2 border-dashed border-[var(--line)] pt-3">
            <button type="button" aria-expanded={joinOpen} aria-controls="student-join" onClick={() => setJoinOpen((v) => !v)} data-testid="join-toggle"
              className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:decoration-[var(--ink)]">
              {FAMILY_COPY.child.joinToggle}<ChevronDown size={16} aria-hidden className={`shrink-0 transition-transform ${joinOpen ? "rotate-180" : ""}`} />
            </button>
            <div id="student-join" hidden={!joinOpen} className="pt-2">{joinOpen && joinForm}</div>
          </div>
        )}
      </section>
  );

  return (
    <div className="space-y-6" data-student-step={step}>
      {inviteMode && (
        <section aria-labelledby="student-invite" className="panel-flat space-y-3 p-5" data-testid="student-invite">
          <h2 id="student-invite" className="text-heading"><KeyRound size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Deine Eltern haben dich eingeladen</h2>
          <p className="text-body text-muted">Prüfe den Code und tritt der Familie bei. Du entscheidest danach selbst, was deine Eltern sehen.</p>
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}
          {joinForm}
        </section>
      )}

      {inviteMode ? (
        <details className="group" data-testid="own-link-toggle">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold underline decoration-2 underline-offset-4">{FAMILY_COPY.child.ownLinkToggle}</summary>
          <div className="pt-3">{connectSection}</div>
        </details>
      ) : connectSection}

      <Modal open={switchCode !== null} onClose={() => setSwitchCode(null)} title={FAMILY_COPY.switch.childTitle}
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setSwitchCode(null)}>{FAMILY_COPY.switch.cancel}</Button><Button loading={busy} onClick={confirmSwitch}>{FAMILY_COPY.switch.confirm}</Button></div>}>
        <p className="text-body">{FAMILY_COPY.switch.childText}</p>
      </Modal>
    </div>
  );
}

function ChecklistItem({ n, done, current, title, children }: { n: number; done: boolean; current?: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-check={n} data-state={done ? "done" : current || n === 1 ? "current" : "todo"}>
      <span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] text-sm font-bold ${done ? "border-[var(--outline-fill)] bg-[var(--mint,var(--success-bg))] text-[var(--ink)]" : "border-[var(--outline)] bg-[var(--surface)]"}`}>
        {done ? <Check size={15} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold">{title}{done && <span className="sr-only"> (erledigt)</span>}</p>
        {children}
      </div>
    </li>
  );
}

/** "Link kopieren" as the primary action where the native share sheet is not available (desktop browsers). */
function PrimaryCopy({ text, primary }: { text: string; primary: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard unavailable */ } }
  return (
    <Button type="button" size="sm" variant={primary ? "primary" : "secondary"} className="min-h-11 sm:min-h-11" onClick={copy} icon={copied ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />} {...(primary ? { "data-primary-action": "" } : {})}>
      <span aria-live="polite">{copied ? FAMILY_COPY.child.copied : FAMILY_COPY.child.copyLink}</span>
    </Button>
  );
}

/** Inline Jahrgang question (fixes the BIRTH_YEAR_REQUIRED dead end for school students). Saves via account_set_type. */
function BirthYearGate({ onSaved, onCancel }: { onSaved: () => Promise<void>; onCancel: () => void }) {
  const [year, setYear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidBirthYear(year)) { setError("Bitte wähle deinen Jahrgang."); return; }
    setBusy(true); setError("");
    try { await setBirthYear(year!); await onSaved(); }
    catch (e) { setError(familyError(e)); setBusy(false); }
  }
  return (
    <form onSubmit={save} aria-labelledby="birth-gate" className="panel-flat space-y-3 p-5" data-birth-gate data-student-step="connect" noValidate>
      <h2 id="birth-gate" className="text-heading">{FAMILY_COPY.child.birthTitle}</h2>
      <p className="text-body text-muted">{FAMILY_COPY.child.birthText}</p>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <BirthYearField value={year} onChange={setYear} id="family-birth-year" />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Abbrechen</Button>
        <Button type="submit" loading={busy} data-primary-action="">{FAMILY_COPY.child.birthCta}</Button>
      </div>
    </form>
  );
}
