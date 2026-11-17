"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Heart, School, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { useAccess } from "@/components/access/access-provider";
import { daysLeftText, isEnforced, LICENCE_PATH } from "@/lib/access/gate";
import { aboMode, paysTwice, RENEWING } from "./abo-logic";
import { formatDateCh } from "@/lib/family-core";
import { bothPricesText, openSoloPortal, soloPlan, startSoloCheckout, type SoloInterval } from "./solo";
import { familyPlan, inAppPaymentEnabled, intervalPriceText, savingText } from "./logic";
import { SoloPayForm } from "./solo-pay-form";

type Return = "success" | "cancel" | "portal" | null;

function readReturn(): Return {
  const v = new URLSearchParams(window.location.search).get("billing");
  return v === "success" || v === "cancel" || v === "portal" ? v : null;
}

export function AboView() {
  const { access, refresh } = useAccess();
  const [period, setPeriod] = useState<SoloInterval>("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ret, setRet] = useState<Return>(null);
  const [payInApp, setPayInApp] = useState(false);

  // Back from Stripe: re-read my_access (the webhook may need a few seconds) and clean the URL.
  useEffect(() => {
    const r = readReturn();
    if (!r) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query is only readable on the client
    setRet(r);
    window.history.replaceState(null, "", "/abo");
    if (r === "cancel") return;
    let tries = 0;
    let alive = true;
    const poll = async () => {
      const info = await refresh();
      tries++;
      if (alive && r === "success" && tries < 8 && !(info?.subscription && RENEWING.includes(info.subscription.status))) setTimeout(poll, 2500);
    };
    void poll();
    return () => { alive = false; };
  }, [refresh]);

  async function buy() {
    // In-app Payment Element when the publishable key is there (like the family package); else hosted Stripe Checkout.
    if (inAppPaymentEnabled()) { setError(""); setPayInApp(true); return; }
    setBusy(true); setError("");
    const r = await startSoloCheckout(period);
    if (r.ok && r.data.url) { window.location.assign(r.data.url); return; }
    setError(r.ok ? "Das hat nicht geklappt. Bitte versuche es in einem Moment nochmals." : r.message);
    setBusy(false);
  }
  async function manage() {
    setBusy(true); setError("");
    const r = await openSoloPortal();
    if (r.ok && r.data.url) { window.location.assign(r.data.url); return; }
    setError(r.ok ? "Das hat nicht geklappt. Bitte versuche es in einem Moment nochmals." : r.message);
    setBusy(false);
  }

  const mode = aboMode(access);
  const enforced = isEnforced(access);
  const intro = !access || !enforced ? null
    : access.state === "trial" ? `Gratis-Testwoche: ${daysLeftText(access.trial_days_left ?? 0)}. Danach brauchst du ein Abo.`
    : !access.has_access ? "Deine Testwoche ist vorbei. Mit einem Abo geht es sofort weiter, deine Daten sind noch da." : null;

  return (
    <div className="mx-auto max-w-[880px] space-y-6" data-testid="abo-page" data-abo-mode={mode}>
      <PageHeader title={<>Dein <span className="marker">Abo</span></>} description={intro ?? "Wähle, wie du WendApply nutzen möchtest."} />
      {ret === "success" && <StatusMessage tone="success" icon={<CheckCircle2 />}>Danke! Die Zahlung ist eingegangen. Die Freischaltung kann ein paar Sekunden dauern. Die Quittung kommt per E-Mail.</StatusMessage>}
      {ret === "cancel" && <StatusMessage tone="info">Es wurde nichts belastet. Du kannst jederzeit nochmals ein Abo wählen.</StatusMessage>}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {paysTwice(access) && (
        <div role="status" data-testid="abo-pays-twice" className="status status-warning flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><strong className="block">Du bist jetzt über {access?.reason === "school_licence" ? "deine Schule" : "deine Familie"} abgedeckt.</strong>Dein Einzelabo brauchst du nicht mehr. Kündige es, damit du nicht doppelt bezahlst.</div>
          <Button size="sm" variant="secondary" className="min-h-11 shrink-0" loading={busy} onClick={manage}>Einzelabo kündigen</Button>
        </div>
      )}

      {mode === "loading" && <div className="panel space-y-3 p-6" aria-busy="true"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></div>}

      {mode === "staff" && (
        <section className="panel space-y-3 p-6" data-testid="abo-staff">
          <h2 className="text-heading"><School size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Schullizenz</h2>
          <p className="text-body">Lehrpersonen und Schulen nutzen WendApply mit einer Schullizenz. Ein Abo brauchst du nicht.</p>
          <ButtonLink href={LICENCE_PATH} variant="secondary">Zur Schullizenz</ButtonLink>
        </section>
      )}

      {mode === "licensed" && (
        <section className="panel space-y-3 p-6" data-testid="abo-licensed">
          <h2 className="text-heading"><School size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Zugang über deine Schule</h2>
          <p className="text-body">Dein Zugang läuft über {access?.school ? <strong>{access.school.name}</strong> : "deine Schule"}. Du musst nichts bezahlen.</p>
        </section>
      )}

      {mode === "family_pending" && (
        <section className="panel space-y-3 p-6" data-testid="abo-family-pending">
          <h2 className="text-heading"><Heart size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familienpaket</h2>
          <p className="text-body">Du bist mit deiner Familie verbunden. Warte, bis deine Eltern das Familienpaket gebucht haben. Dann geht es automatisch weiter.</p>
          <ButtonLink href="/familie" variant="secondary">Zur Familie</ButtonLink>
        </section>
      )}

      {mode === "family_covered" && (
        <section className="panel space-y-3 p-6" data-testid="abo-family-covered">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-heading"><Heart size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familienpaket</h2><Badge tone="success">Aktiv</Badge></div>
          <p className="text-body">Du bist über das Familienpaket deiner Familie abgedeckt. {access?.account_type === "parent" ? "Rechnungen und Zahlungsart verwaltest du auf der Familienseite." : "Du musst nichts tun."}</p>
          <ButtonLink href="/familie#abo" variant="secondary">Zur Familie</ButtonLink>
        </section>
      )}

      {mode === "solo_active" && access?.subscription && (
        <section className="panel space-y-3 p-6" data-testid="abo-solo-active">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-heading"><Sparkles size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Einzelabo</h2>
            <Badge tone={access.subscription.status === "past_due" ? "warning" : "success"}>{access.subscription.status === "past_due" ? "Zahlung offen" : access.subscription.cancel_at_period_end ? "Gekündigt" : "Aktiv"}</Badge>
          </div>
          <p className="text-body tabular">
            {intervalPriceText(soloPlan(), access.subscription.interval === "month" ? "month" : "year")}
            {access.subscription.current_period_end ? (access.subscription.cancel_at_period_end ? ` · läuft bis ${formatDateCh(access.subscription.current_period_end)}` : ` · nächste Zahlung am ${formatDateCh(access.subscription.current_period_end)}`) : ""}
          </p>
          <Button variant="secondary" loading={busy} onClick={manage} icon={<CreditCard size={15} aria-hidden />}>Abo verwalten</Button>
        </section>
      )}

      {mode === "parent" && (
        <section className="panel space-y-3 p-6" data-testid="abo-plan-family">
          <h2 className="text-heading"><Heart size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familienpaket</h2>
          <p className="text-body tabular font-semibold">{bothPricesText(familyPlan())}</p>
          <p className="text-body text-muted">Für dich und dein Kind. Du siehst die Fortschritte deines Kindes, dein Kind nutzt alle Funktionen. Jederzeit kündbar.</p>
          <ButtonLink href="/familie#abo" size="lg" data-primary-action="">Familienpaket wählen</ButtonLink>
        </section>
      )}

      {mode === "student" && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="panel space-y-4 p-6" data-testid="abo-plan-solo">
            <h2 className="text-heading"><Sparkles size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Einzelabo</h2>
            <p className="text-body text-muted">Alle Funktionen für dich: Lehrstellensuche, Bewerbungen, KI-Check, dein Dorf. Jederzeit kündbar.</p>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-bold">Abrechnung</legend>
              {(["month", "year"] as const).map((o) => {
                const checked = period === o;
                return (
                  <label key={o} className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-2 p-3 transition-colors ${checked ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] hover:border-[var(--outline)]"}`}>
                    <input type="radio" name="solo-interval" value={o} checked={checked} disabled={payInApp} onChange={() => setPeriod(o)} className="size-4 shrink-0 accent-[var(--brand)]" />
                    <span className="text-sm"><span className="font-bold">{o === "month" ? "Monatlich" : "Jährlich"}</span> · <span className="tabular">{intervalPriceText(soloPlan(), o)}</span></span>
                    {o === "year" && savingText(soloPlan()) && <span className="ml-auto rounded-full bg-[var(--sun)] px-2 py-0.5 text-xs font-bold text-[var(--on-sun)]">Spare {savingText(soloPlan())!.replace(/ günstiger.*$/, "")}</span>}
                  </label>
                );
              })}
            </fieldset>
            {payInApp ? (
              <SoloPayForm interval={period} onCancel={() => setPayInApp(false)} />
            ) : (
              <>
                <Button size="lg" full loading={busy} onClick={buy} icon={<CreditCard size={16} aria-hidden />} data-primary-action="">Einzelabo buchen</Button>
                <p className="text-small text-muted">Bezahlung mit Karte über Stripe. Endpreise in CHF.</p>
              </>
            )}
          </section>
          <div className="space-y-4">
            <section className="panel-flat space-y-2 p-6" data-testid="abo-plan-family">
              <h2 className="text-heading"><Heart size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Lieber über deine Eltern?</h2>
              <p className="text-body text-muted">Das Familienpaket ({bothPricesText(familyPlan())}) buchen deine Eltern. Es gilt für dich und ein Elternteil.</p>
              <ButtonLink href="/familie" variant="secondary">Eltern einladen</ButtonLink>
            </section>
            <section className="panel-flat space-y-2 p-6">
              <h2 className="text-heading"><School size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Hat deine Schule eine Lizenz?</h2>
              <p className="text-body text-muted">Dann tritt der Klasse mit dem Code deiner Lehrperson bei. Du musst nichts bezahlen.</p>
              <ButtonLink href="/classes" variant="secondary">Klassencode eingeben</ButtonLink>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
