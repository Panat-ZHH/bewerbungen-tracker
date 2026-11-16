"use client";

/**
 * Return page of the in-app payment (/familie/bezahlen/fertig?session_id=cs_…). Asks the server whether the Checkout
 * Session is paid, then waits until the webhook has written the subscription (source of truth) and shows the active
 * plan. Covers: confirmed, paid but not yet activated (webhook delay), not completed (3DS/TWINT aborted), expired.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { PLANS } from "@/lib/billing/plans";
import { fetchBillingStatus, fetchCheckoutSession } from "./api";
import { INTERVAL_LABEL, PER_INTERVAL, billingStatusLabel, hasSubscription, payAmountText, payPageHref, readReturnSession, type BillingInterval, type BillingStatus } from "./logic";

type View =
  | { name: "checking" }
  | { name: "active"; status: BillingStatus; interval: BillingInterval }
  | { name: "pending"; interval: BillingInterval }
  | { name: "open"; familyId: string | null; interval: BillingInterval }
  | { name: "expired"; familyId: string | null; interval: BillingInterval }
  | { name: "error"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const formatDate = (iso: string | null) => { const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null; return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };

export function InAppReturn() {
  const [view, setView] = useState<View>({ name: "checking" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    const id = readReturnSession(window.location.search);
    (async () => {
      if (!id) { setView({ name: "error", message: "Wir konnten keine Zahlung zu diesem Link finden." }); return; }
      // The session flips to "complete" right after confirm; poll briefly for redirect-based methods.
      let s = await fetchCheckoutSession(id);
      for (let i = 0; alive && s.ok && s.data.status === "open" && i < 3; i++) { await sleep(1500); s = await fetchCheckoutSession(id); }
      if (!alive) return;
      if (!s.ok) { setView({ name: "error", message: s.message }); return; }
      const { status, interval, familyId = null } = s.data;
      if (status === "expired") { setView({ name: "expired", familyId, interval }); return; }
      if (status !== "complete") { setView({ name: "open", familyId, interval }); return; }
      if (!familyId) { setView({ name: "pending", interval }); return; }
      // Paid. Wait for the webhook to activate the subscription (usually 1–5 s).
      for (let i = 0; alive && i < 15; i++) {
        const b = await fetchBillingStatus({ kind: "family", id: familyId });
        if (!alive) return;
        if (b.ok && hasSubscription(b.data)) { setView({ name: "active", status: b.data!, interval }); return; }
        await sleep(2000);
      }
      if (alive) setView({ name: "pending", interval });
    })();
    return () => { alive = false; };
  }, [round]);

  const header = <PageHeader title={view.name === "active" || view.name === "pending" ? "Danke für deine Bestellung!" : "Zahlung"} />;
  const plan = PLANS.family;

  if (view.name === "checking") {
    return (<>{header}<div className="panel max-w-xl space-y-3 p-5" aria-busy="true" data-pay-return="checking"><p className="text-heading flex items-center gap-2"><span className="spinner" aria-hidden /> Zahlung wird bestätigt…</p><p className="text-body text-muted">Das dauert nur ein paar Sekunden. Bitte schliess die Seite nicht.</p><Skeleton className="h-20" /></div></>);
  }
  if (view.name === "active") {
    const label = billingStatusLabel(view.status);
    return (
      <>
        {header}
        <div className="panel max-w-xl space-y-4 p-5" data-pay-return="active">
          <p className="text-heading flex items-center gap-2"><CheckCircle2 size={22} aria-hidden className="text-[var(--success-fg)]" /> Dein Familienpaket ist aktiv</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Paket</dt><dd className="font-bold">{plan.name}</dd>
            <dt className="text-muted">Status</dt><dd><Badge tone={label.tone}>{label.label}</Badge></dd>
            <dt className="text-muted">Abrechnung</dt><dd className="font-semibold">{INTERVAL_LABEL[view.interval]} · <span className="tabular">{payAmountText(plan, view.interval)} {PER_INTERVAL[view.interval]}</span></dd>
            {view.status.validUntil && <><dt className="text-muted">{view.status.cancelAtPeriodEnd ? "Läuft bis" : "Verlängert am"}</dt><dd className="font-semibold">{formatDate(view.status.validUntil)}</dd></>}
          </dl>
          <p className="text-small text-muted">Die Quittung kommt per E-Mail. Zahlungsart, Rechnungen und Kündigung findest du jederzeit unter «Abo verwalten».</p>
          <ButtonLink href="/familie#abo" variant="sun" size="lg">Weiter zur Familie</ButtonLink>
        </div>
      </>
    );
  }
  if (view.name === "pending") {
    return (
      <>
        {header}
        <div className="panel max-w-xl space-y-4 p-5" data-pay-return="pending">
          <p className="text-heading flex items-center gap-2"><Clock size={22} aria-hidden className="text-[var(--warning-fg)]" /> Zahlung erhalten</p>
          <p className="text-body text-muted">Die Freischaltung dauert noch einen Moment. Du musst nichts mehr tun. Die Quittung kommt per E-Mail.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={() => { setView({ name: "checking" }); setRound((r) => r + 1); }}>Status prüfen</Button>
            <ButtonLink href="/familie#abo" variant="primary">Zur Familie</ButtonLink>
          </div>
        </div>
      </>
    );
  }
  if (view.name === "open" || view.name === "expired") {
    const retry = view.familyId ? payPageHref(view.familyId, view.interval) : "/familie#abo";
    return (
      <>
        {header}
        <div className="panel max-w-xl space-y-4 p-5" data-pay-return={view.name}>
          <p className="text-heading flex items-center gap-2"><XCircle size={22} aria-hidden className="text-[var(--danger-fg)]" /> Zahlung nicht abgeschlossen</p>
          <p className="text-body text-muted">{view.name === "expired" ? "Die Bezahlung ist abgelaufen. Es wurde nichts belastet." : "Die Zahlung wurde nicht bestätigt. Es wurde nichts belastet."} Du kannst es gleich nochmals versuchen.</p>
          <div className="flex flex-wrap gap-2"><ButtonLink href={retry} variant="sun">Nochmals versuchen</ButtonLink><ButtonLink href="/familie#abo" variant="ghost">Zur Familie</ButtonLink></div>
        </div>
      </>
    );
  }
  return (
    <>
      {header}
      <div className="panel max-w-xl space-y-4 p-5" data-pay-return="error">
        <p className="text-body">{view.message}</p>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setView({ name: "checking" }); setRound((r) => r + 1); }}>Nochmals prüfen</Button><ButtonLink href="/familie#abo" variant="ghost">Zur Familie</ButtonLink></div>
      </div>
    </>
  );
}
