"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, CreditCard, Mail, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { joinWaitlist } from "@/lib/family";
import { FamilyBilling, FamilyPlanBody, familyPhaseBadge, type FamilyBillingState } from "@/components/billing/billing-card";
import { FAMILY_COPY } from "@/lib/family-copy";
import { FREE_NOTICE, onlinePaymentEnabled } from "@/components/billing/logic";
import { familyError, PLAN_STATUS_TONE, planGivesAccess, planSummary, waitlistProblem, type FamilyPlan, type WaitlistKind } from "@/lib/family-core";

/** Plan states that give the family the package (child view: "Familienpaket aktiv"). The old 30-day "trial" row does not (SPEC §3). */
const ACCESS_STATES = ["pilot", "active"];

/**
 * Family plan card (#abo).
 * - Flag off (default): honest "kostenlos" note and "Zugang anfragen" (both roles, unchanged).
 * - Flag on, parent with `billing` (from useFamilyBilling on /familie): badge and body follow the billing phase only.
 * - Flag on, child: neutral line, never prices or payment problems (S8).
 */
export function PlanCard({ plan, email, kind = "family", familyId = null, isParent = false, online = onlinePaymentEnabled(), billing = null, current = false, open = false, expired = false }: {
  plan: FamilyPlan | null; email: string; kind?: WaitlistKind; familyId?: string | null; isParent?: boolean; online?: boolean;
  billing?: FamilyBillingState | null;
  /** Step 3 is the current setup step: the card's main button is the page's single primary action. */
  current?: boolean;
  /** Show the purchase form before step 3 is current ("Paket schon jetzt buchen"). */
  open?: boolean;
  /** Parent whose trial is over (flag off): the card text says so and «Zugang anfragen» is the page's single primary action. */
  expired?: boolean;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  /** Parent before the trial ends: connecting the child leads, so «Zugang anfragen» stays secondary. Child view unchanged. */
  const requestLeads = expired || !isParent;
  if (online && isParent && billing && familyId) {
    const badge = familyPhaseBadge(billing.activationPending ? null : billing.phase);
    return (
      <section id="abo" aria-labelledby="family-plan" className={`panel-flat scroll-mt-24 space-y-3 p-5 ${current ? "outline outline-2 outline-offset-2 outline-[var(--brand)]" : ""}`} data-billing-enabled="on">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="family-plan" className="text-heading"><Sparkles size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{current && billing.phase !== "past_due" && billing.phase !== "unpaid" ? FAMILY_COPY.step3.title : "Familienpaket"}</h2>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        <FamilyPlanBody familyId={familyId} billing={billing} current={current} open={open} />
      </section>
    );
  }
  if (online && !isParent) {
    const active = !!plan && ACCESS_STATES.includes(plan.state ?? plan.status);
    return (
      <section id="abo" aria-labelledby="family-plan" className="panel-flat scroll-mt-24 space-y-2 p-5" data-billing-enabled="on" data-billing-state="child">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="family-plan" className="text-heading"><Sparkles size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familienpaket</h2>
          {active && <Badge tone="success">{FAMILY_COPY.badge.active}</Badge>}
        </div>
        <p className="text-body text-muted">{active ? FAMILY_COPY.child.planActive : FAMILY_COPY.child.planNone}</p>
      </section>
    );
  }
  const s = planSummary(plan, undefined, { online });
  const unlocked = planGivesAccess(plan);
  return (
    <section id="abo" aria-labelledby="family-plan" className="panel-flat scroll-mt-24 space-y-3 p-5" data-billing-enabled={online ? "on" : "off"}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="family-plan" className="text-heading"><Sparkles size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{s.title}</h2>
        {s.status && <Badge tone={plan ? PLAN_STATUS_TONE[plan.status] ?? "neutral" : "info"}>{s.status}</Badge>}
      </div>
      <p className="text-body text-muted">{expired && !online && !plan ? FAMILY_COPY.parent.expiredPlanOffline : s.detail}</p>
      {online ? <FamilyBilling familyId={familyId} isParent={isParent} enabled /> : unlocked ? (
        // Active/pilot plan while online payment is off: nothing to request or pay, so no «Zugang anfragen» next to «Aktiv» (AUDIT-B P1, QA M5).
        <p className="flex items-center gap-2 text-small text-muted" data-billing-state="off-unlocked"><CheckCircle2 size={16} aria-hidden className="shrink-0 text-[var(--success-fg)]" />{FAMILY_COPY.parent.planUnlocked}</p>
      ) : (
        <div className="space-y-2 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--line)] p-3" data-billing-state="off">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold"><CreditCard size={16} aria-hidden className="shrink-0" />Bezahlung bald verfügbar</p>
            {/* Parent: filled only when it is the next step (trial over); otherwise connecting the child leads (QA M5). */}
            <Button size="sm" variant={requestLeads ? "sun" : "secondary"} onClick={() => setRequestOpen(true)} icon={<Mail size={14} />} {...(expired ? { "data-primary-action": "" } : {})}>Zugang anfragen</Button>
          </div>
          <p className="text-small text-muted">{expired ? FAMILY_COPY.parent.expiredNoticeOffline : FREE_NOTICE}</p>
        </div>
      )}
      {!online && <RequestAccessModal open={requestOpen} onClose={() => setRequestOpen(false)} email={email} kind={kind} />}
    </section>
  );
}

export function RequestAccessModal({ open, onClose, email, kind }: { open: boolean; onClose: () => void; email: string; kind: WaitlistKind }) {
  const [mail, setMail] = useState(email);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"ok" | "unavailable" | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = waitlistProblem(mail, message);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try { setDone((await joinWaitlist(mail, kind, message)) ? "ok" : "unavailable"); }
    catch (e) { setError(familyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Zugang anfragen" description="Wir melden uns, sobald das Familienpaket buchbar ist oder ein Testzugang frei wird. Es entstehen keine Kosten.">
      {done === "ok" ? (
        <StatusMessage tone="success" icon={<CheckCircle2 />}>Danke! Wir haben deine Anfrage erhalten und melden uns per E-Mail.</StatusMessage>
      ) : done === "unavailable" ? (
        <div className="space-y-3">
          <StatusMessage tone="info">Die Warteliste ist bald verfügbar. Schreib uns in der Zwischenzeit über das Kontaktformular.</StatusMessage>
          <ButtonLink href="/kontakt" variant="secondary" icon={<Mail size={16} />}>Zum Kontaktformular</ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}
          <Field label="E-Mail-Adresse" htmlFor="waitlist-email"><Input id="waitlist-email" type="email" autoComplete="email" inputMode="email" value={mail} onChange={(e) => setMail(e.target.value)} required maxLength={254} /></Field>
          <Field label="Nachricht (freiwillig)" htmlFor="waitlist-message" hint="Zum Beispiel: wie viele Kinder"><Textarea id="waitlist-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} /></Field>
          <Button type="submit" loading={busy} full>Anfrage senden</Button>
        </form>
      )}
    </Modal>
  );
}
