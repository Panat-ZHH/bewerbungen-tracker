"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, FileText, Mail, ReceiptText, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { fetchBillingStatus, openPortal, startCheckout } from "./api";
import { BillingReturnNotice } from "./billing-return";
import {
  FREE_NOTICE, VAT_NOTE, billingHint, billingIntervals, billingStatusLabel, familyPlan, hasSubscription, intervalPriceText, isPurchasable,
  onlinePaymentEnabled, paymentOptions, priceWithVat, schoolPlans, seatsText, termText, vatNote, type BillingInterval, type BillingOwner,
  type BillingStatus, type PaymentMethod,
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
        <dt className="text-muted">Abo</dt><dd className="font-bold">{plan ? plan.name : "–"}{plan && <span className="font-normal text-muted"> · {priceWithVat(plan)}</span>}</dd>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function buy(plan: PlanId, payment: PaymentMethod, interval: BillingInterval = "year") {
    setBusy(true); setError("");
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
      <span className="block">Die Rechnung kommt per E-Mail. Die Lizenz wird freigeschaltet, sobald sie bezahlt ist.</span>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2">Rechnung ansehen<ExternalLink size={14} aria-hidden /><span className="sr-only"> (öffnet in neuem Tab)</span></a>}
    </StatusMessage>
  );
}

function SchoolCheckout({ owner, onInvoice }: { owner: BillingOwner; onInvoice: (url: string | null) => void }) {
  const plans = schoolPlans();
  const [plan, setPlan] = useState<PlanId>(() => wantedPlan("school") ?? "professional");
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const options = paymentOptions(PLANS[plan]);
  const method = options.includes(payment) ? payment : options[0];
  const { busy, error, buy } = useCheckout(owner, onInvoice);
  return (
    <div className="space-y-4" data-billing-state="choose">
      <PlanPicker plans={plans} value={plan} onChange={setPlan} name={`plan-${owner.id}`} />
      <PaymentChoice options={options} value={method} onChange={setPayment} name={`payment-${owner.id}`} />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button loading={busy} onClick={() => buy(plan, method)} icon={method === "invoice" ? <FileText size={16} aria-hidden /> : <CreditCard size={16} aria-hidden />}>
          {method === "invoice" ? `${PLANS[plan].name} per Rechnung bestellen` : `${PLANS[plan].name} mit Karte bezahlen`}
        </Button>
        <ButtonLink href="/kontakt" variant="ghost" icon={<Mail size={16} aria-hidden />}>Individuelles Angebot</ButtonLink>
      </div>
      <p className="text-small text-muted">Alle Preise in CHF pro Jahr, {VAT_NOTE}. Jahresabo, kündbar auf Ende der Laufzeit. Schülerinnen und Schüler bezahlen nie etwas.</p>
    </div>
  );
}

/** Shown while the flag is off (or if a section needs the honest default). */
export function BillingOffNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-3" data-billing-state="off">
      <p className="flex items-start gap-2 text-body"><ReceiptText size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{FREE_NOTICE}</p>
      {children}
    </div>
  );
}

/**
 * "Abo & Rechnung" for one school in /schul-admin. Flag off: honest "kostenlos" copy + contact. Flag on: current subscription
 * (+ portal) or plan/payment choice (card or invoice). `anchor` gives the section id="abo" (links from /preise).
 */
export function BillingCard({ schoolId, anchor = false, enabled = onlinePaymentEnabled() }: { schoolId: string; anchor?: boolean; enabled?: boolean }) {
  const owner: BillingOwner = { kind: "school", id: schoolId };
  const { load, reload } = useBillingStatus(owner, enabled);
  // Invoice requested: keep the confirmation (the licence follows once the invoice is paid, via the webhook).
  const [invoice, setInvoice] = useState<{ url: string | null } | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (anchor && window.location.hash === "#abo") ref.current?.scrollIntoView({ block: "start" }); }, [anchor]);
  const headingId = `billing-${schoolId}`;
  return (
    <section ref={ref} id={anchor ? "abo" : undefined} aria-labelledby={headingId} className="panel-flat scroll-mt-24 space-y-4 p-5" data-billing-enabled={enabled ? "on" : "off"}>
      <h3 id={headingId} className="text-heading flex items-center gap-2"><ReceiptText size={18} aria-hidden /> Abo &amp; Rechnung</h3>
      {anchor && <BillingReturnNotice onSuccess={reload} />}
      {!enabled ? (
        <BillingOffNotice>
          <p className="text-small text-muted">Eine Offerte, eine Rechnung oder ein anderes Paket bekommst du über die Kontaktseite.</p>
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
        <SchoolCheckout owner={owner} onInvoice={(url) => setInvoice({ url })} />
      )}
    </section>
  );
}

/**
 * Family package purchase for the plan card in /familie (card only). Returns null while the flag is off, so the plan card
 * keeps its "Zugang anfragen" flow. Children see the status but cannot buy; without a family the parent creates one first.
 */
export function FamilyBilling({ familyId, isParent, enabled = onlinePaymentEnabled() }: { familyId: string | null; isParent: boolean; enabled?: boolean }) {
  const owner: BillingOwner | null = familyId ? { kind: "family", id: familyId } : null;
  const { load, reload } = useBillingStatus(owner, enabled && isParent);
  const plan = familyPlan();
  const intervals = billingIntervals(plan);
  const [interval, setBillingInterval] = useState<BillingInterval>(() => wantedInterval(intervals));
  const checkout = useCheckout(owner ?? { kind: "family", id: "" }, () => { void reload(); }); // families never pay by invoice
  if (!enabled) return null;
  const price = <p className="tabular text-lg font-extrabold" data-family-price>{priceWithVat(plan)}</p>;
  if (!isParent) return <div className="space-y-2" data-billing-state="child">{price}<p className="text-small text-muted">Das Familienpaket bucht ein Elternteil in seinem Konto. Für dich bleibt alles kostenlos.</p></div>;
  if (!owner) return <div className="space-y-2" data-billing-state="no-family">{price}<p className="text-small text-muted">Erstelle zuerst deine Familie. Danach kannst du das Familienpaket hier buchen.</p></div>;
  if (load.state === "loading") return <div aria-busy="true" className="space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-10" /></div>;
  if (load.state === "error") return <div className="space-y-2"><StatusMessage tone="warning">{load.message}</StatusMessage><Button size="sm" variant="secondary" onClick={reload}>Nochmals versuchen</Button></div>;
  if (hasSubscription(load.status)) return <SubscriptionDetails status={load.status!} owner={owner} canManage />;
  return (
    <div className="space-y-3" data-billing-state="choose">
      {price}
      <IntervalChoice plan={plan} options={intervals} value={interval} onChange={setBillingInterval} name={`interval-${owner.id}`} />
      <PaymentChoice options={paymentOptions(plan)} value="card" onChange={() => {}} />
      {checkout.error && <StatusMessage tone="danger">{checkout.error}</StatusMessage>}
      <Button variant="sun" loading={checkout.busy} onClick={() => checkout.buy(plan.id, "card", interval)} icon={<CreditCard size={16} aria-hidden />}>
        Familienpaket buchen ({intervalPriceText(plan, interval)})
      </Button>
      <p className="text-small text-muted">{termText(interval)}, für {seatsText(plan)}, {vatNote(plan)}.</p>
    </div>
  );
}
