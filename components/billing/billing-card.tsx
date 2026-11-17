"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, ExternalLink, FileText, Lock, Mail, ReceiptText, RefreshCw, Settings2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { BILLING, PLANS, formatChf, yearlySavingChf, type PlanId } from "@/lib/billing/plans";
import { FAMILY_COPY, fill } from "@/lib/family-copy";
import { fetchBillingStatus, openPortal, startCheckout } from "./api";
import { BillingReturnNotice } from "./billing-return";
import {
  FREE_NOTICE, billingHint, billingIntervals, billingPhase, billingStatusLabel, familyBuyTarget, familyManageMode, familyPlan, hasSubscription, intervalPriceText, isPurchasable,
  onlinePaymentEnabled, paymentOptions, priceText, schoolPlans, termText, type BillingInterval, type BillingOwner,
  type BillingPhase, type BillingStatus, type PaymentMethod, type Tone,
} from "./logic";
import { IntervalChoice } from "./interval-choice";
import { PaymentChoice } from "./payment-choice";
import { PlanPicker } from "./plan-picker";

const formatDate = (iso: string | null) => { const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null; return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
const wantedPlan = (kind: "school" | "family"): PlanId | null => {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search).get("plan");
  return isPurchasable(p, kind) ? p : null;
};
/** ?interval=month|year from /preise links; default yearly. */
const wantedInterval = (options: BillingInterval[]): BillingInterval => {
  if (typeof window === "undefined") return "year";
  const v = new URLSearchParams(window.location.search).get("interval");
  return v === "month" || v === "year" ? (options.includes(v) ? v : "year") : "year";
};

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; status: BillingStatus | null };

/** Loads /api/billing/status for one owner; `reload` after a purchase. Only runs when the flag is on. */
function useBillingStatus(owner: BillingOwner | null, active: boolean) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const id = owner?.id; const kind = owner?.kind;
  const reload = useCallback(async () => {
    if (!active || !id || !kind) return;
    setLoad({ state: "loading" });
    const r = await fetchBillingStatus({ kind, id } as BillingOwner);
    setLoad(r.ok ? { state: "ready", status: r.data } : { state: "error", message: r.message });
  }, [active, id, kind]);
  useEffect(() => { void reload(); }, [reload]); // eslint-disable-line react-hooks/set-state-in-effect -- loads server state once
  return { load, reload };
}

/** "Abo verwalten" → Stripe customer portal (change payment method, invoices, cancel). */
function ManageButton({ owner }: { owner: BillingOwner }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true); setError("");
    const r = await openPortal(owner);
    if (r.ok && r.data?.url) { window.location.assign(r.data.url); return; }
    setError(r.ok ? "Das Kundenportal ist gerade nicht erreichbar." : r.message); setBusy(false);
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" loading={busy} onClick={go} icon={<Settings2 size={16} aria-hidden />}>Abo verwalten</Button>
      <p className="text-small text-muted">Zahlungsmethode, Rechnungen und Kündigung findest du im Kundenportal.</p>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    </div>
  );
}

function SubscriptionDetails({ status, owner, canManage }: { status: BillingStatus; owner: BillingOwner; canManage: boolean }) {
  const plan = status.plan ? PLANS[status.plan] : null;
  const label = billingStatusLabel(status);
  const hint = billingHint(status);
  return (
    <div className="space-y-3" data-billing-state="subscribed">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Abo</dt><dd className="font-bold">{plan ? plan.name : "–"}{plan && <span className="font-normal text-muted"> · {priceText(plan)}</span>}</dd>
        <dt className="text-muted">Status</dt><dd><Badge tone={label.tone}>{label.label}</Badge></dd>
        {status.collectionMethod && <><dt className="text-muted">Zahlungsart</dt><dd className="font-semibold">{status.collectionMethod === "send_invoice" ? "Rechnung" : "Kreditkarte"}</dd></>}
        {status.validUntil && <><dt className="text-muted">{status.cancelAtPeriodEnd ? "Läuft bis" : "Verlängert am"}</dt><dd className="font-semibold">{formatDate(status.validUntil)}</dd></>}
      </dl>
      {hint && <p role="status" className="status status-warning text-sm">{hint}</p>}
      {canManage && <ManageButton owner={owner} />}
    </div>
  );
}

/** Checkout / invoice request. Card → redirect to the payment page; invoice → message (+ link to the invoice if there is one). */
function useCheckout(owner: BillingOwner, onInvoice: (url: string | null) => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function buy(plan: PlanId, payment: PaymentMethod, interval: BillingInterval = "year") {
    setBusy(true); setError("");
    // Families pay inside the app (Payment Element on /familie/bezahlen); hosted Checkout stays the fallback.
    if (owner.kind === "family" && payment === "card") { const target = familyBuyTarget(owner.id, interval); if (target.kind === "in-app") { router.push(target.href); return; } }
    const r = await startCheckout(owner, plan, payment, interval);
    if (!r.ok) { setError(r.message); setBusy(false); return; }
    if (r.data?.invoice) { setBusy(false); onInvoice(r.data.url ?? null); return; }
    if (r.data?.url) { window.location.assign(r.data.url); return; }
    setError("Die Bezahlseite konnte nicht geöffnet werden. Bitte versuche es nochmals."); setBusy(false);
  }
  return { busy, error, buy };
}

function InvoiceSent({ url }: { url: string | null }) {
  return (
    <StatusMessage tone="success" icon={<CheckCircle2 />}>
      <span className="block font-bold">Rechnung angefordert</span>
      <span className="block">{`Die Rechnung kommt per E-Mail. Die Lizenz ist in wenigen Sekunden aktiv. Die Rechnung ist innert ${BILLING.invoiceDaysUntilDue} Tagen zahlbar; bleibt sie offen, endet der Zugang nach einer kurzen Nachfrist.`}</span>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2">Rechnung ansehen<ExternalLink size={14} aria-hidden /><span className="sr-only"> (öffnet in neuem Tab)</span></a>}
    </StatusMessage>
  );
}

function SchoolCheckout({ owner, onInvoice, currentPackage = null }: { owner: BillingOwner; onInvoice: (url: string | null) => void; currentPackage?: string | null }) {
  const plans = schoolPlans();
  const current = isPurchasable(currentPackage, "school") ? currentPackage : null;
  const [plan, setPlan] = useState<PlanId>(() => wantedPlan("school") ?? current ?? "professional");
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const options = paymentOptions(PLANS[plan]);
  const method = options.includes(payment) ? payment : options[0];
  const { busy, error, buy } = useCheckout(owner, onInvoice);
  return (
    <div className="space-y-4" data-billing-state="choose">
      {current && <p className="text-sm"><span className="text-muted">Aktuelles Paket:</span> <strong>{PLANS[current].name}</strong></p>}
      <PlanPicker plans={plans} value={plan} onChange={setPlan} name={`plan-${owner.id}`} current={current} />
      <PaymentChoice options={options} value={method} onChange={setPayment} name={`payment-${owner.id}`} />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button loading={busy} onClick={() => buy(plan, method)} icon={method === "invoice" ? <FileText size={16} aria-hidden /> : <CreditCard size={16} aria-hidden />}>
          {method === "invoice" ? `${PLANS[plan].name} per Rechnung bestellen` : `${PLANS[plan].name} mit Karte bezahlen`}
        </Button>
        <ButtonLink href="/kontakt" variant="ghost" icon={<Mail size={16} aria-hidden />}>Offerte anfragen</ButtonLink>
      </div>
      <p className="text-small text-muted">Alle Preise in CHF pro Jahr. Jahresabo, kündbar auf Ende der Laufzeit. Schülerinnen und Schüler bezahlen nie etwas.</p>
    </div>
  );
}

/** Shown while the flag is off (or if a section needs the honest default). */
export function BillingOffNotice({ children, text = FREE_NOTICE }: { children?: React.ReactNode; text?: string }) {
  return (
    <div className="space-y-3" data-billing-state="off">
      <p className="flex items-start gap-2 text-body"><ReceiptText size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{text}</p>
      {children}
    </div>
  );
}

/**
 * "Lizenz & Rechnung" for one school in /schul-admin. Flag off: honest "kostenlos" copy + contact. Flag on: current subscription
 * (+ portal) or plan/payment choice (card or invoice). `anchor` gives the section id="abo" (links from /preise).
 */
export function BillingCard({ schoolId, anchor = false, enabled = onlinePaymentEnabled(), currentPackage = null }: { schoolId: string; anchor?: boolean; enabled?: boolean; currentPackage?: string | null }) {
  const owner: BillingOwner = { kind: "school", id: schoolId };
  const { load, reload } = useBillingStatus(owner, enabled);
  // Invoice requested: keep the confirmation (send_invoice subscriptions are active right away; unpaid after the term => grace, then expired).
  const [invoice, setInvoice] = useState<{ url: string | null } | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (anchor && window.location.hash === "#abo") ref.current?.scrollIntoView({ block: "start" }); }, [anchor]);
  const headingId = `billing-${schoolId}`;
  return (
    <section ref={ref} id={anchor ? "abo" : undefined} aria-labelledby={headingId} className="panel-flat scroll-mt-24 space-y-4 p-5" data-billing-enabled={enabled ? "on" : "off"}>
      <h3 id={headingId} className="text-heading flex items-center gap-2"><ReceiptText size={18} aria-hidden /> Lizenz &amp; Rechnung</h3>
      {anchor && <BillingReturnNotice onSuccess={reload} />}
      {!enabled ? (
        <BillingOffNotice text="Die Online-Bezahlung ist gerade nicht verfügbar. Eine Offerte, eine Rechnung oder ein anderes Paket bekommst du über die Kontaktseite.">
          <ButtonLink href="/kontakt" variant="secondary" size="sm" icon={<Mail size={14} aria-hidden />}>Kontakt aufnehmen</ButtonLink>
        </BillingOffNotice>
      ) : invoice ? (
        <InvoiceSent url={invoice.url} />
      ) : load.state === "loading" ? (
        <div aria-busy="true" className="space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /></div>
      ) : load.state === "error" ? (
        <div className="space-y-3">
          <StatusMessage tone="warning">{load.message}</StatusMessage>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={reload}>Nochmals versuchen</Button><ButtonLink href="/kontakt" size="sm" variant="ghost" icon={<Mail size={14} aria-hidden />}>Kontakt aufnehmen</ButtonLink></div>
        </div>
      ) : hasSubscription(load.status) ? (
        <SubscriptionDetails status={load.status!} owner={owner} canManage />
      ) : (
        <SchoolCheckout owner={owner} onInvoice={(url) => setInvoice({ url })} currentPackage={currentPackage} />
      )}
    </section>
  );
}

// ================================================================ family package (parents, /familie)
const PAID: BillingPhase[] = ["active", "trialing", "canceling", "paused"];
/** sessionStorage: checkout came back with success for this family, so no second buy button for 10 minutes (BILLING-FLOW-SPEC §3.4). */
export const CHECKOUT_PENDING_KEY = "wa_checkout_pending";
const PENDING_TTL_MS = 10 * 60 * 1000;
const INTERVAL_KEY = "wa_checkout_interval";
const PORTAL_KEY = "wa_portal_phase";
const POLL_MS = 2000;
const POLL_TRIES = 15; // 2 s x 15 = 30 s

const store = {
  get(k: string) { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { window.sessionStorage.removeItem(k); } catch { /* private mode */ } },
};
function pendingFor(familyId: string): boolean {
  const [id, ts] = (store.get(CHECKOUT_PENDING_KEY) ?? "").split("|");
  if (id !== familyId) return false;
  if (!(Date.now() - Number(ts) < PENDING_TTL_MS)) { store.del(CHECKOUT_PENDING_KEY); return false; }
  return true;
}

export type FamilyReturn = "cancel" | "activating" | "active" | "slow" | "portal";
type FamilyLoad = { state: "loading" } | { state: "error"; httpStatus: number; message: string } | { state: "ready"; status: BillingStatus | null };

/**
 * Billing state of one family for the parent page: status + phase, the return from Stripe (?billing=success|cancel|portal),
 * polling after a successful checkout (every 2 s, up to 30 s) and the sessionStorage guard against a second purchase.
 * `onPaid` runs once the package is active (e.g. reload family_get_my). Does nothing while the flag is off.
 */
export function useFamilyBilling(familyId: string | null, enabled: boolean, onPaid?: () => void) {
  const [load, setLoad] = useState<FamilyLoad>({ state: "loading" });
  const [ret, setRet] = useState<FamilyReturn | null>(null);
  const [portalPhase, setPortalPhase] = useState<BillingPhase | null>(null);
  const [interval, setBillingInterval] = useState<BillingInterval>(() => wantedInterval(billingIntervals(familyPlan())));
  const started = useRef<string | null>(null);
  const alive = useRef(true);
  const paidRef = useRef(onPaid);
  useEffect(() => { paidRef.current = onPaid; }, [onPaid]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const fetchOnce = useCallback(async (): Promise<FamilyLoad> => {
    if (!familyId) return { state: "ready", status: null };
    const r = await fetchBillingStatus({ kind: "family", id: familyId });
    return r.ok ? { state: "ready", status: r.data } : { state: "error", httpStatus: r.status, message: r.message };
  }, [familyId]);

  const markPaid = useCallback(() => { store.del(CHECKOUT_PENDING_KEY); setRet("active"); paidRef.current?.(); }, []);

  /** Polls until the webhook has activated the package; true when it is active. */
  const poll = useCallback(async (tries: number) => {
    for (let i = 0; i < tries; i++) {
      const l = await fetchOnce();
      if (!alive.current) return false;
      if (l.state === "ready" && PAID.includes(billingPhase(l.status))) { setLoad(l); return true; }
      if (i === tries - 1) { setLoad(l); return false; }
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current) return false;
    }
    return false;
  }, [fetchOnce]);

  useEffect(() => {
    if (!enabled || !familyId || started.current === familyId) return;
    started.current = familyId;
    const search = new URLSearchParams(window.location.search);
    const param = search.get("billing");
    if (param) {
      search.delete("billing"); search.delete("session_id");
      const q = search.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    }
    void (async () => {
      if (param === "success" || (!param && pendingFor(familyId))) {
        if (param === "success") store.set(CHECKOUT_PENDING_KEY, `${familyId}|${Date.now()}`);
        setRet(param === "success" ? "activating" : "slow");
        if (await poll(param === "success" ? POLL_TRIES : 1)) markPaid();
        else if (alive.current) setRet("slow");
        return;
      }
      if (param === "cancel") {
        const iv = store.get(INTERVAL_KEY);
        if (iv === "month" || iv === "year") setBillingInterval(iv);
        setRet("cancel");
      }
      const l = await fetchOnce();
      if (!alive.current) return;
      setLoad(l);
      if (param === "portal" && l.state === "ready") {
        const before = store.get(PORTAL_KEY); store.del(PORTAL_KEY);
        const now = billingPhase(l.status);
        if (before && before !== now) { setPortalPhase(now); setRet("portal"); }
      }
    })();
  }, [enabled, familyId, fetchOnce, poll, markPaid]);

  /** "Nochmals versuchen" / "Nochmals prüfen". */
  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    const l = await fetchOnce();
    if (!alive.current) return;
    setLoad(l);
    if (l.state === "ready" && PAID.includes(billingPhase(l.status)) && (ret === "slow" || ret === "activating")) markPaid();
  }, [fetchOnce, markPaid, ret]);

  const status = load.state === "ready" ? load.status : null;
  const phase: BillingPhase | null = load.state === "ready" ? billingPhase(status) : null;
  /** Buy buttons stay hidden while a successful checkout is being activated (no double purchase). */
  const activationPending = ret === "activating" || ret === "slow";
  return { load, status, phase, ret, portalPhase, dismissReturn: () => setRet(null), reload, interval, setInterval: setBillingInterval, activationPending };
}
export type FamilyBillingState = ReturnType<typeof useFamilyBilling>;

const PHASE_BADGE: Record<BillingPhase, { label: string; tone: Tone } | null> = {
  none: null,
  incomplete: { label: FAMILY_COPY.badge.incomplete, tone: "warning" },
  trialing: { label: FAMILY_COPY.badge.trialing, tone: "info" },
  active: { label: FAMILY_COPY.badge.active, tone: "success" },
  canceling: { label: FAMILY_COPY.badge.canceling, tone: "neutral" },
  past_due: { label: FAMILY_COPY.badge.pastDue, tone: "warning" },
  unpaid: { label: FAMILY_COPY.badge.unpaid, tone: "danger" },
  paused: { label: FAMILY_COPY.badge.paused, tone: "warning" },
  ended: { label: FAMILY_COPY.badge.ended, tone: "neutral" },
};
export const familyPhaseBadge = (p: BillingPhase | null) => (p ? PHASE_BADGE[p] : null);
/** "Das Familienpaket gilt für dich und 1 Kind (2 Konten)." from the plan's seats (eltern-05). */
function familySeatsLine(plan: ReturnType<typeof familyPlan>): string {
  const children = plan.seats?.children ?? 1;
  return fill(FAMILY_COPY.step3.text, { children, accounts: children + (plan.seats?.parents ?? 1) });
}

/** Body text of one phase (dates as dd.mm.yyyy). */
export function familyPhaseText(p: BillingPhase, validUntil: string | null): string {
  const date = formatDate(validUntil);
  switch (p) {
    case "active": return date ? fill(FAMILY_COPY.phase.active, { date }) : "";
    case "trialing": return date ? fill(FAMILY_COPY.phase.trialing, { date }) : "";
    case "canceling": return fill(FAMILY_COPY.phase.canceling, { date: date || "zum Ende der Laufzeit" });
    case "past_due": return FAMILY_COPY.phase.pastDue;
    case "unpaid": return FAMILY_COPY.phase.unpaid;
    case "paused": return FAMILY_COPY.phase.paused;
    case "incomplete": return FAMILY_COPY.phase.incomplete;
    case "ended": return FAMILY_COPY.phase.ended;
    default: return "";
  }
}

/** Opens the Stripe customer portal for the family (manage, renew, update card). Remembers the phase to detect changes on return. */
export function FamilyPortalButton({ familyId, phase, label, primary = false, note = true }: { familyId: string; phase: BillingPhase | null; label: string; primary?: boolean; note?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true); setError("");
    if (phase) store.set(PORTAL_KEY, phase);
    const r = await openPortal({ kind: "family", id: familyId });
    if (r.ok && r.data?.url) { window.location.assign(r.data.url); return; }
    setError(r.ok ? FAMILY_COPY.api.unreachable : r.message); setBusy(false);
  }
  return (
    <div className="space-y-2">
      <Button variant={primary ? "primary" : "secondary"} loading={busy} onClick={go} icon={primary ? <CreditCard size={16} aria-hidden /> : <Settings2 size={16} aria-hidden />} data-primary-action={primary ? "" : undefined}>{label}</Button>
      {note && <p className="text-small text-muted">{FAMILY_COPY.manage.note}</p>}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    </div>
  );
}

/** Step 3: interval choice (yearly preselected), what is included, the buy button and the Stripe note. */
function FamilyChoose({ familyId, billing, primary, ctaLabel }: { familyId: string; billing: FamilyBillingState; primary: boolean; ctaLabel?: string }) {
  const plan = familyPlan();
  const intervals = billingIntervals(plan);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const price = intervalPriceText(plan, billing.interval);
  const saving = yearlySavingChf(plan);
  async function buy() {
    setBusy(true); setError("");
    store.set(INTERVAL_KEY, billing.interval);
    // In-app Payment Element page when available (preview e2e B1); hosted Checkout stays the fallback.
    const target = familyBuyTarget(familyId, billing.interval);
    if (target.kind === "in-app") { router.push(target.href); return; }
    const r = await startCheckout({ kind: "family", id: familyId }, plan.id, "card", billing.interval);
    if (r.ok && r.data?.url) { window.location.assign(r.data.url); return; }
    setError(r.ok ? "Die Bezahlseite konnte nicht geöffnet werden. Bitte versuche es nochmals." : r.status === 503 || r.status === 404 ? FAMILY_COPY.api.unreachable : r.message);
    setBusy(false);
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  return (
    <div className="space-y-4" data-billing-state={busy ? "redirecting" : "choose"}>
      <p className="text-body">{familySeatsLine(plan)}</p>
      <IntervalChoice plan={plan} options={intervals} value={billing.interval} onChange={billing.setInterval} name={`interval-${familyId}`}
        legend={FAMILY_COPY.step3.intervalLegend} yearBadge={saving > 0 ? fill(FAMILY_COPY.step3.yearBadge, { saving: formatChf(saving) }) : undefined} />
      {error && <div ref={errorRef} tabIndex={-1} className="outline-none"><StatusMessage tone="danger">{error}</StatusMessage></div>}
      <div className="space-y-2">
        <Button variant={primary ? "primary" : "secondary"} full loading={busy} onClick={buy} icon={<Lock size={16} aria-hidden />} data-primary-action={primary ? "" : undefined}>
          {ctaLabel ?? fill(FAMILY_COPY.step3.cta, { price })}
        </Button>
        {busy && <p role="status" className="text-small font-semibold">{FAMILY_COPY.step3.redirecting}</p>}
      </div>
      <p className="text-small text-muted">{fill(FAMILY_COPY.step3.note, { term: termText(billing.interval) })}</p>
    </div>
  );
}

/**
 * Family package card body for parents, driven only by the billing phase (BILLING-FLOW-SPEC §3.5).
 * `current`: this card is the current setup step, so its main button is the page's single primary action.
 * `open`: show the purchase form even though step 3 is not current yet ("Paket schon jetzt buchen").
 */
export function FamilyPlanBody({ familyId, billing, current, open }: { familyId: string; billing: FamilyBillingState; current: boolean; open: boolean }) {
  const [rebuy, setRebuy] = useState(false);
  const { load, phase, status } = billing;
  if (billing.activationPending) {
    return (
      <div className="space-y-2" data-billing-state={billing.ret === "slow" ? "activation-slow" : "activating"} aria-busy={billing.ret === "activating"}>
        <p className="text-body">{billing.ret === "slow" ? FAMILY_COPY.return.slowText : FAMILY_COPY.return.activatingText}</p>
        {billing.ret === "activating" && <Skeleton className="h-10" />}
      </div>
    );
  }
  if (load.state === "loading") return <div aria-busy="true" className="space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-10" /></div>;
  if (load.state === "error") {
    return (
      <div className="space-y-3" data-billing-state="error">
        <StatusMessage tone="warning">{load.httpStatus === 503 || load.httpStatus === 404 ? FAMILY_COPY.api.unreachable : FAMILY_COPY.status.error}</StatusMessage>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={current ? "primary" : "secondary"} onClick={() => void billing.reload()} icon={<RefreshCw size={14} aria-hidden />} data-primary-action={current ? "" : undefined}>{FAMILY_COPY.page.retry}</Button>
          <ButtonLink href="/kontakt" size="sm" variant="ghost" icon={<Mail size={14} aria-hidden />}>{FAMILY_COPY.status.contact}</ButtonLink>
        </div>
      </div>
    );
  }
  const p = phase ?? "none";
  const text = familyPhaseText(p, status?.validUntil ?? null);
  if (p === "none") {
    return current || open ? <FamilyChoose familyId={familyId} billing={billing} primary={current} /> : (
      <div className="space-y-2" data-billing-state="choose-later">
        <p className="text-body">{familySeatsLine(familyPlan())}</p>
        <p className="tabular text-sm font-bold" data-family-price>{priceText(familyPlan())}</p>
      </div>
    );
  }
  if (p === "incomplete") {
    return <div className="space-y-3" data-billing-state="incomplete"><p className="text-body">{text}</p><FamilyChoose familyId={familyId} billing={billing} primary={current} ctaLabel={FAMILY_COPY.cta.completePayment} /></div>;
  }
  if (p === "ended") {
    return (
      <div className="space-y-3" data-billing-state="ended">
        <p className="text-body">{text}</p>
        {rebuy || open ? <FamilyChoose familyId={familyId} billing={billing} primary={current} /> : (
          <Button variant={current ? "primary" : "secondary"} onClick={() => setRebuy(true)} icon={<Sparkles size={16} aria-hidden />} data-primary-action={current ? "" : undefined}>{FAMILY_COPY.cta.rebuy}</Button>
        )}
      </div>
    );
  }
  const fix = p === "past_due" || p === "unpaid";
  const manage = familyManageMode(status ?? null);
  if (manage === "manual") {
    // Trial / pilot / manual plan from WendApply: no portal, no "other parent"; a trial can be upgraded right away.
    // It never renews, so "Verlängert sich am …" would contradict "läuft ohne Abo" (eltern-07).
    const until = formatDate(status?.validUntil ?? null);
    const manualText = p === "active" ? (until ? fill(FAMILY_COPY.phase.manualUntil, { date: until }) : "") : text;
    return (
      <div className="space-y-3" data-billing-state={p} data-billing-manage="manual">
        {manualText && <p className="text-body">{manualText}</p>}
        <p className="text-small text-muted">{FAMILY_COPY.manage.manual}</p>
        {p === "trialing" && (rebuy || open ? <FamilyChoose familyId={familyId} billing={billing} primary={current} /> : (
          <Button variant="secondary" onClick={() => setRebuy(true)} icon={<Sparkles size={16} aria-hidden />}>{FAMILY_COPY.manage.buyNow}</Button>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-billing-state={p}>
      {text && <p className={fix ? "text-body font-semibold" : "text-body"}>{text}</p>}
      {manage === "other-parent"
        ? <p className="text-small text-muted" data-billing-manage="other-parent">{FAMILY_COPY.manage.otherParent}</p>
        : <FamilyPortalButton familyId={familyId} phase={p} primary={fix && current} label={fix ? FAMILY_COPY.cta.updateCard : p === "canceling" ? FAMILY_COPY.cta.renew : FAMILY_COPY.cta.manage} />}
    </div>
  );
}

/** Return notice at the top of /familie: cancel, activating, active, slow (with "Nochmals prüfen"), portal change. */
export function FamilyReturnNotice({ billing }: { billing: FamilyBillingState }) {
  const r = billing.ret;
  if (!r) return null;
  const portalBadge = familyPhaseBadge(billing.portalPhase);
  const m = r === "cancel" ? { tone: "info", title: FAMILY_COPY.return.cancelTitle, text: FAMILY_COPY.return.cancelText }
    : r === "activating" ? { tone: "info", title: FAMILY_COPY.return.activatingTitle, text: FAMILY_COPY.return.activatingText }
    : r === "active" ? { tone: "success", title: FAMILY_COPY.return.activeTitle, text: FAMILY_COPY.return.activeText }
    : r === "slow" ? { tone: "warning", title: FAMILY_COPY.return.slowTitle, text: FAMILY_COPY.return.slowText }
    : { tone: "info", title: portalBadge ? `Familienpaket: ${portalBadge.label}` : FAMILY_COPY.step3.title, text: familyPhaseText(billing.portalPhase ?? "none", billing.status?.validUntil ?? null) };
  return (
    <div role="status" data-billing-return={r} className={`status status-${m.tone} flex items-start gap-3`}>
      {r === "active" ? <CheckCircle2 size={20} aria-hidden className="mt-0.5 shrink-0" /> : r === "activating" ? <RefreshCw size={20} aria-hidden className="mt-0.5 shrink-0 motion-safe:animate-spin" /> : <ReceiptText size={20} aria-hidden className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-2">
        <div><p className="font-bold">{m.title}</p>{m.text && <p className="text-sm">{m.text}</p>}</div>
        {r === "slow" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void billing.reload()} icon={<RefreshCw size={14} aria-hidden />}>{FAMILY_COPY.return.slowCta}</Button>
            <Link href="/kontakt" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2">{FAMILY_COPY.status.contact}</Link>
          </div>
        )}
      </div>
      {r !== "activating" && <button type="button" onClick={billing.dismissReturn} className="-m-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--hover)]" aria-label="Hinweis schliessen"><span aria-hidden>×</span></button>}
    </div>
  );
}

/** Parent purchase card without the /familie stepper (kept for other mounts). */
function ParentFamilyBilling({ familyId }: { familyId: string }) {
  const billing = useFamilyBilling(familyId, true);
  return <div className="space-y-3"><FamilyReturnNotice billing={billing} /><FamilyPlanBody familyId={familyId} billing={billing} current open /></div>;
}

/**
 * Family package for the plan card in /familie (card only). Returns null while the flag is off, so the plan card keeps its
 * "Zugang anfragen" flow. Children never see prices or payment states (S8); without a family the parent creates one first.
 */
export function FamilyBilling({ familyId, isParent, enabled = onlinePaymentEnabled() }: { familyId: string | null; isParent: boolean; enabled?: boolean }) {
  if (!enabled) return null;
  if (!isParent) return <div className="space-y-2" data-billing-state="child"><p className="text-small text-muted">{FAMILY_COPY.child.planNone}</p></div>;
  if (!familyId) return <div className="space-y-2" data-billing-state="no-family"><p className="tabular text-lg font-extrabold" data-family-price>{priceText(familyPlan())}</p><p className="text-small text-muted">{FAMILY_COPY.step1.text}</p></div>;
  return <ParentFamilyBilling familyId={familyId} />;
}
