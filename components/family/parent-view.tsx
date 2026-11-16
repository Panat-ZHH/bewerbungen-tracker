"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Mail, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { openPortal } from "@/components/billing/api";
import { BillingBanner } from "@/components/billing/billing-banner";
import { FamilyReturnNotice, familyPhaseBadge, useFamilyBilling } from "@/components/billing/billing-card";
import { onlinePaymentEnabled } from "@/components/billing/logic";
import { joinFamily, leaveFamily, removeMember, setConsent } from "@/lib/family";
import { childrenOf, CONSENT_LABEL, CONSENT_TONE, familyError, parentsOf, seatUsage, sharingActive, type FamilyMember, type MyFamily } from "@/lib/family-core";
import { FAMILY_COPY, fill } from "@/lib/family-copy";
import { ChildOverview } from "./child-overview";
import { FamilyStepper, type StepperItem } from "./family-stepper";
import { InvitePanel, JoinForm } from "./invite-panel";
import { childNeedingConsent, connectedChild, FIX_PHASES, openChildInvite, parentNextAction, STEP_TODO_TEXT } from "./parent-steps";
import { PlanCard } from "./plan-card";

type Confirm = { kind: "grant" | "withdraw" | "remove"; child: FamilyMember } | null;
type Invite = { code: string; expiresAt: string | null };

// TODO(copy): move to FAMILY_COPY
const LOCAL_COPY = {
  childrenEmpty: "Sobald dein Kind verbunden ist, siehst du hier, was es mit dir teilt.",
  contactLink: "Zur Kontaktseite",
};
const WAIT_REFRESH_MS = 15_000;

/**
 * Parent dashboard (BILLING-FLOW-SPEC §3.1): stepper until everything is set up, then children + overview, the current step
 * card first in the side column (invite / consent / plan), the plan card, and the other parents. Exactly one primary action.
 */
export function ParentView({ family, email, onChanged, initialCode = "" }: { family: MyFamily; email: string; onChanged: () => void; initialCode?: string }) {
  const online = onlinePaymentEnabled();
  const billing = useFamilyBilling(family.id, online, onChanged);
  const kids = childrenOf(family);
  const [selected, setSelected] = useState<string | null>(kids[0]?.userId ?? null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localInvite, setLocalInvite] = useState<Invite | null>(null);
  const [payNow, setPayNow] = useState(false);
  const [switchCode, setSwitchCode] = useState<string | null>(null);
  const seats = seatUsage(family);
  const current = kids.find((k) => k.userId === selected) ?? kids[0] ?? null;

  const withLocal: MyFamily = localInvite ? { ...family, invites: [...(family.invites ?? []), { ...localInvite, direction: "parent_invites_child" }] } : family;
  const invite = openChildInvite(withLocal);
  const phase = billing.phase ?? "none";
  const next = parentNextAction(withLocal, phase, { initialCode: "", online });
  const action = next.current;
  const planIsCurrent = action === "buy" || action === "rebuy" || action === "fix_payment";
  const child = connectedChild(family);
  const consentChild = childNeedingConsent(family);
  /** Empty own family without a subscription: joining the child's family instead is offered (S9). */
  const onlyMe = family.members.length <= 1 && (phase === "none" || phase === "ended");

  // Waiting for the child: refresh every 15 s and when the window gets focus, so the next step appears by itself.
  useEffect(() => {
    if (action !== "wait_child") return;
    const t = window.setInterval(onChanged, WAIT_REFRESH_MS);
    const focus = () => onChanged();
    window.addEventListener("focus", focus);
    return () => { window.clearInterval(t); window.removeEventListener("focus", focus); };
  }, [action, onChanged]);

  const fixPayment = useCallback(async () => {
    const r = await openPortal({ kind: "family", id: family.id });
    if (r.ok && r.data?.url) window.location.assign(r.data.url);
    else setError(r.ok ? FAMILY_COPY.api.unreachable : r.message);
  }, [family.id]);

  async function run() {
    if (!confirm) return;
    setBusy(true); setError("");
    try {
      if (confirm.kind === "remove") await removeMember(confirm.child.userId);
      else await setConsent(confirm.child.userId, confirm.kind === "grant");
      setConfirm(null); onChanged();
    } catch (e) { setError(familyError(e)); setConfirm(null); }
    finally { setBusy(false); }
  }
  async function switchFamily() {
    if (!switchCode) return;
    setBusy(true); setError("");
    try { await leaveFamily(); await joinFamily(switchCode); setSwitchCode(null); onChanged(); }
    catch (e) { setError(familyError(e)); setSwitchCode(null); }
    finally { setBusy(false); }
  }
  function openPlanNow() {
    setPayNow(true);
    requestAnimationFrame(() => document.getElementById("abo")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const badge = familyPhaseBadge(billing.phase);
  const items: StepperItem[] = next.steps.map((s) => {
    if (s.id === "family") return { ...s, title: FAMILY_COPY.step1.title, line: fill(FAMILY_COPY.step1.done, { name: family.name }) };
    if (s.id === "child") {
      const line = s.state === "done" ? fill(FAMILY_COPY.step2.done, { child: child?.displayName ?? "Dein Kind" })
        : s.state === "attention" ? fill(FAMILY_COPY.consent.title, { child: consentChild?.displayName ?? "Dein Kind" })
        : invite ? FAMILY_COPY.step2.waiting.split(". ")[0] + "." : STEP_TODO_TEXT.child;
      return { ...s, title: FAMILY_COPY.step2.title, line };
    }
    const line = s.state === "done" ? (phase === "active" || phase === "trialing" ? FAMILY_COPY.step3.done : badge?.label ?? FAMILY_COPY.step3.done)
      : s.state === "attention" ? badge?.label ?? FAMILY_COPY.badge.pastDue : STEP_TODO_TEXT.plan;
    return { ...s, title: FAMILY_COPY.step3.title, line };
  });

  const stepCard = action === "invite_child" || action === "wait_child" ? (
    <section aria-labelledby="step-child" className="panel-flat space-y-3 p-5 outline outline-2 outline-offset-2 outline-[var(--brand)]" data-current-step="child">
      <h2 id="step-child" className="text-heading"><UserPlus size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{FAMILY_COPY.step2.title}</h2>
      <p className="text-body text-muted">{FAMILY_COPY.step2.text}</p>
      <InvitePanel direction="parent_invites_child" initialInvite={invite} onCreated={setLocalInvite} primary hideTitle />
      {invite && (
        <div className="space-y-1" data-invite-waiting>
          <p role="status" className="flex items-start gap-2 text-sm font-semibold"><span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--brand)] motion-safe:animate-pulse" />{FAMILY_COPY.step2.waiting}</p>
          <p className="text-small text-muted">{FAMILY_COPY.step2.noAccount}</p>
        </div>
      )}
      {online && !payNow && (phase === "none" || phase === "ended") && (
        <button type="button" onClick={openPlanNow} className="min-h-11 text-sm font-semibold underline underline-offset-2">{FAMILY_COPY.step2.payNow}</button>
      )}
      {onlyMe && (
        <details className="group border-t-2 border-dashed border-[var(--line)] pt-3" open={!!initialCode} data-join-toggle>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            {FAMILY_COPY.step1.joinToggle}<ChevronDown size={16} aria-hidden className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 pt-2">
            <p className="text-small text-muted">{FAMILY_COPY.step1.joinText}</p>
            <JoinForm initialCode={initialCode} onJoined={onChanged} title={FAMILY_COPY.step1.joinLabel} label={FAMILY_COPY.step1.joinLabel} submitLabel={FAMILY_COPY.step1.joinCta} primary={false} onAlreadyInFamily={setSwitchCode} />
          </div>
        </details>
      )}
    </section>
  ) : action === "consent" && consentChild ? (
    <section aria-labelledby="step-consent" className="panel-flat space-y-3 p-5 outline outline-2 outline-offset-2 outline-[var(--sun)]" data-current-step="consent">
      <h2 id="step-consent" className="text-heading"><ShieldCheck size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{fill(FAMILY_COPY.consent.title, { child: consentChild.displayName })}</h2>
      <p className="text-body text-muted">{fill(FAMILY_COPY.consent.text, { child: consentChild.displayName })}</p>
      <Button onClick={() => setConfirm({ kind: "grant", child: consentChild })} icon={<ShieldCheck size={16} />} data-primary-action="">{FAMILY_COPY.consent.cta}</Button>
    </section>
  ) : null;

  const planCard = <PlanCard plan={family.plan} email={email} familyId={family.id} isParent online={online} billing={online ? billing : null} current={planIsCurrent} open={payNow} />;
  const fix = FIX_PHASES.includes(phase) && !billing.activationPending;

  return (
    <div className="space-y-6">
      {online && fix && <BillingBanner phase={phase} onFix={fixPayment} />}
      {online && <FamilyReturnNotice billing={billing} />}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <FamilyStepper items={items} action={action} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="family-children" className={`panel-flat min-w-0 space-y-4 p-5 lg:order-none ${action === "done" ? "" : "order-last"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="family-children" className="text-heading"><Users size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Kinder</h2>
            <span className="text-small text-muted">{seats.children.used} von {seats.children.limit} {seats.children.limit === 1 ? "Platz" : "Plätzen"} belegt</span>
          </div>
          {kids.length === 0 ? <p className="text-body text-muted">{LOCAL_COPY.childrenEmpty}</p> : (
            <ul className="space-y-2" aria-label="Kinder in deiner Familie">
              {kids.map((k) => (
                <li key={k.userId} className={`rounded-[var(--radius-lg)] border-[length:var(--border-w)] p-3 ${current?.userId === k.userId ? "border-[var(--outline-fill)]" : "border-[var(--line)]"}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={k.displayName} size="sm" />
                    <button type="button" onClick={() => setSelected(k.userId)} aria-pressed={current?.userId === k.userId} className="min-h-11 min-w-0 flex-1 text-left font-bold">{k.displayName}</button>
                    <Badge tone={CONSENT_TONE[k.consentStatus]}>{k.status === "pending" ? "Einladung offen" : CONSENT_LABEL[k.consentStatus]}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(k.consentStatus === "pending" || k.consentStatus === "withdrawn") && <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "grant", child: k })} icon={<ShieldCheck size={14} />}>Zustimmung geben</Button>}
                    {k.consentStatus === "granted" && <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "withdraw", child: k })}>Zustimmung zurückziehen</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "remove", child: k })} icon={<UserMinus size={14} />}>Entfernen</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {kids.length > 0 && seats.children.full && (
            <p className="text-small text-muted" data-seat-full>{FAMILY_COPY.seat.fullChild} <Link href="/kontakt" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Mail size={13} aria-hidden />{LOCAL_COPY.contactLink}</Link></p>
          )}
          {current && (
            <div className="border-t-2 border-dashed border-[var(--line)] pt-4" aria-live="polite">
              <h3 className="mb-3 text-heading">Überblick: {current.displayName}</h3>
              {sharingActive(current) ? <ChildOverview key={current.userId} childId={current.userId} name={current.displayName} /> : (
                <p className="text-body text-muted">{current.consentStatus === "pending" ? `${current.displayName} ist unter 16. Sobald du zustimmst, siehst du hier, was ${current.displayName} teilt.` : current.status === "pending" ? "Die Einladung ist noch nicht angenommen." : "Teilen ist pausiert."}</p>
              )}
            </div>
          )}
        </section>
        {/* Mobile: the current step comes first; once everything is set up the children overview leads. */}
        <div className={`min-w-0 space-y-6 lg:order-none ${action === "done" ? "" : "order-first"}`}>
          {planIsCurrent ? planCard : <>{stepCard}{planCard}</>}
          {parentsOf(family).length > 0 && <p className="text-small text-muted">Eltern in dieser Familie: {parentsOf(family).map((p) => p.displayName).join(", ")}</p>}
        </div>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === "grant" ? "Zustimmung geben?" : confirm?.kind === "withdraw" ? "Zustimmung zurückziehen?" : "Aus der Familie entfernen?"}
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setConfirm(null)}>Abbrechen</Button><Button variant={confirm?.kind === "remove" ? "danger" : "primary"} loading={busy} onClick={run}>{confirm?.kind === "grant" ? "Ja, ich stimme zu" : confirm?.kind === "withdraw" ? "Zurückziehen" : "Entfernen"}</Button></div>}>
        {confirm?.kind === "grant" && <p className="text-body">Ich bin erziehungsberechtigt für {confirm.child.displayName} und bin einverstanden, dass {confirm.child.displayName} WendApply mit unserer Familie nutzt. {confirm.child.displayName} entscheidet selbst, was geteilt wird, und kann das Teilen jederzeit stoppen. Du kannst die Zustimmung jederzeit zurückziehen.</p>}
        {confirm?.kind === "withdraw" && <p className="text-body">Danach siehst du nichts mehr von {confirm.child.displayName}. Das Konto und die Bewerbungen von {confirm.child.displayName} bleiben bestehen.</p>}
        {confirm?.kind === "remove" && <p className="text-body">{confirm.child.displayName} verlässt die Familie. Das eigene Konto mit allen Bewerbungen bleibt bestehen, nur das Teilen endet.</p>}
      </Modal>
      <Modal open={!!switchCode} onClose={() => setSwitchCode(null)} title={FAMILY_COPY.switch.parentTitle}
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setSwitchCode(null)}>{FAMILY_COPY.switch.cancel}</Button><Button loading={busy} onClick={switchFamily}>{FAMILY_COPY.switch.confirm}</Button></div>}>
        <p className="text-body" data-switch="parent">{FAMILY_COPY.switch.parentText}</p>
      </Modal>
    </div>
  );
}
