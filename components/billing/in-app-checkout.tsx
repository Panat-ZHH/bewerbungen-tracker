"use client";

/**
 * In-app payment for the family package (/familie/bezahlen). Stripe Checkout Session with ui_mode "elements": the
 * Payment Element (card, Apple Pay / Google Pay, other enabled methods) renders inside our own page, themed with the
 * app's tokens (stripe-appearance.ts). Order summary and pay button are our own components. SCA/3DS runs in Stripe's
 * modal; redirect-based methods come back to /familie/bezahlen/fertig. The webhook stays the source of truth.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Lock, RefreshCw } from "lucide-react";
import { loadStripe, type Stripe, type StripeCheckoutElementsSdk, type StripeCheckoutLoadActionsSuccess } from "@stripe/stripe-js";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { fetchBillingStatus, startInAppCheckout } from "./api";
import { IntervalChoice } from "./interval-choice";
import {
  PAY_DONE_PATH, PER_INTERVAL, billingIntervals, familyPlan, hasSubscription, inAppPaymentEnabled, payAmountText, paymentErrorMessage,
  readPayParams, seatsText, termText, type BillingInterval,
} from "./logic";
import { cssTokenReader, stripeAppearance, stripeFonts } from "./stripe-appearance";

/** A fresh Stripe.js instance per Checkout Session (one Checkout Elements SDK per instance); the script itself loads once. */
const getStripeJs = (): Promise<Stripe | null> => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "", { locale: "de" });

const BENEFITS = ["Gemeinsame Bewerbungsübersicht für dich und dein Kind", "Fristen, Erinnerungen und Dorf ohne Einschränkung", "Jederzeit kündbar unter «Abo verwalten»"];

type Phase =
  | { name: "checking" }
  | { name: "subscribed" }
  | { name: "loading" }
  | { name: "ready" }
  | { name: "error"; message: string };

export function InAppCheckout() {
  const plan = familyPlan();
  const intervals = billingIntervals(plan);
  const [params] = useState(() => (typeof window === "undefined" ? { familyId: null, interval: "year" as BillingInterval } : readPayParams(window.location.search)));
  const familyId = params.familyId;
  const [interval, setBillingInterval] = useState<BillingInterval>(params.interval);
  const [phase, setPhase] = useState<Phase>({ name: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [complete, setComplete] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const mountRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<StripeCheckoutElementsSdk | null>(null);
  const actionsRef = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const sessionRef = useRef<string>("");
  const enabled = inAppPaymentEnabled();
  const router = useRouter();

  // 1) Already subscribed? Then there is nothing to pay (the API would answer 409 anyway).
  useEffect(() => {
    if (!enabled || !familyId) return;
    let alive = true;
    void fetchBillingStatus({ kind: "family", id: familyId }).then((r) => {
      if (!alive) return;
      if (r.ok && hasSubscription(r.data)) setPhase({ name: "subscribed" });
      else if (!r.ok && (r.status === 401 || r.status === 403)) setPhase({ name: "error", message: r.message });
      else setPhase({ name: "loading" });
    });
    return () => { alive = false; };
  }, [enabled, familyId]);

  // 2) Session + Payment Element (again when the interval changes or after "Nochmals versuchen").
  const ready = phase.name === "loading" || phase.name === "ready";
  useEffect(() => {
    if (!enabled || !familyId || !ready) return;
    let alive = true;
    setComplete(false); setPayError(""); // eslint-disable-line react-hooks/set-state-in-effect -- reset per new session
    setPhase((p) => (p.name === "ready" ? { name: "loading" } : p));
    (async () => {
      const [stripe, session] = await Promise.all([getStripeJs(), startInAppCheckout(familyId, interval)]);
      if (!alive) return;
      if (!session.ok) { setPhase(session.code === "already_subscribed" ? { name: "subscribed" } : { name: "error", message: session.message }); return; }
      if (!stripe) { setPhase({ name: "error", message: "Das Zahlungsformular konnte nicht geladen werden. Prüf deine Verbindung und versuch es nochmals." }); return; }
      const clientSecret = session.data.clientSecret;
      sessionRef.current = clientSecret.split("_secret_")[0];
      const checkout = stripe.initCheckoutElementsSdk({
        clientSecret,
        elementsOptions: { appearance: stripeAppearance(cssTokenReader()), fonts: stripeFonts(window.location.origin), loader: "never" },
      });
      checkoutRef.current = checkout;
      const element = checkout.createPaymentElement({
        layout: { type: "tabs" },
        wallets: { applePay: "auto", googlePay: "auto", link: "never" },
        // Stripe's own mandate text is formal German ("Sie"); we show the same consent in our words (Du) above the button.
        terms: { card: "never", applePay: "never", googlePay: "never", klarna: "never" },
      });
      element.on("change", (e) => setComplete(Boolean(e.complete)));
      element.on("ready", () => { if (alive) setPhase({ name: "ready" }); });
      element.on("loaderror", () => { if (alive) setPhase({ name: "error", message: "Das Zahlungsformular konnte nicht geladen werden. Versuch es nochmals." }); });
      if (mountRef.current) element.mount(mountRef.current);
      const loaded = await checkout.loadActions();
      if (!alive) return;
      if (loaded.type === "success") actionsRef.current = loaded.actions;
      else setPhase({ name: "error", message: "Das Zahlungsformular konnte nicht geladen werden. Versuch es nochmals." });
    })();
    return () => {
      alive = false;
      checkoutRef.current?.getPaymentElement()?.destroy();
      checkoutRef.current = null; actionsRef.current = null;
    };
  }, [enabled, familyId, interval, attempt, ready]);

  // 3) Light/dark switch → re-theme the iframe. Only on a real theme change: Stripe itself touches <html> during
  // confirm(), and re-theming on every mutation would loop forever.
  useEffect(() => {
    const root = document.documentElement;
    let theme = root.getAttribute("data-theme");
    const obs = new MutationObserver(() => {
      const next = root.getAttribute("data-theme");
      if (next === theme) return;
      theme = next;
      checkoutRef.current?.changeAppearance(stripeAppearance(cssTokenReader()));
    });
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const pay = useCallback(async () => {
    const actions = actionsRef.current;
    if (!actions || paying) return;
    setPaying(true); setPayError("");
    const donePath = `${PAY_DONE_PATH}?session_id=${encodeURIComponent(sessionRef.current)}`;
    // No returnUrl here: the session already has return_url (set by the server). Passing it again makes confirm() hang
    // silently (Stripe.js endive, 2026-11). Redirect-based methods (TWINT, some 3DS) go to that URL; cards stay here.
    const result = await actions.confirm({ redirect: "if_required" });
    if (result.type === "success") { router.push(donePath); return; }
    const e = result.error as { code?: string | null; message?: string; paymentFailed?: { declineCode: string | null } };
    setPayError(paymentErrorMessage({ code: e.code, declineCode: e.paymentFailed?.declineCode ?? null, message: e.message }));
    setPaying(false);
  }, [paying, router]);

  const back = <ButtonLink href="/familie#abo" variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden />}>Zurück zur Familie</ButtonLink>;
  const header = <PageHeader title="Familienpaket bezahlen" description="Sicher bezahlen, direkt hier in WendApply." actions={back} />;

  if (!enabled) {
    return (<>{header}<StatusMessage tone="info">Die Bezahlung in der App ist gerade ausgeschaltet. Du kannst das Familienpaket auf der Seite «Familie» buchen.</StatusMessage></>);
  }
  if (!familyId) {
    return (<>{header}<div className="space-y-3"><StatusMessage tone="warning">Dieser Link ist unvollständig. Starte die Bezahlung bitte auf deiner Familienseite.</StatusMessage><ButtonLink href="/familie#abo" variant="secondary">Zur Familie</ButtonLink></div></>);
  }
  if (phase.name === "subscribed") {
    return (<>{header}<div className="panel max-w-xl space-y-3 p-5" data-pay-state="subscribed"><p className="text-heading">Du hast das Familienpaket schon</p><p className="text-body text-muted">Es ist bereits ein Abo aktiv. Zahlungsart, Rechnungen und Kündigung findest du unter «Abo verwalten».</p><ButtonLink href="/familie#abo" variant="primary">Zur Familie</ButtonLink></div></>);
  }

  const amount = payAmountText(plan, interval);
  return (
    <>
      {header}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]" data-pay-state={phase.name}>
        {/* Order summary: first on phones, right column on desktop */}
        <aside aria-labelledby="pay-summary" className="panel space-y-4 p-5 lg:sticky lg:top-24 lg:order-2">
          <div>
            <p className="sticker sticker-mint tilt-l mb-3 text-xs">Für Familien</p>
            <h2 id="pay-summary" className="text-heading">{plan.name}</h2>
            <p className="text-small text-muted">{seatsText(plan)}</p>
          </div>
          <IntervalChoice plan={plan} options={intervals} value={interval} onChange={(v) => { if (!paying) setBillingInterval(v); }} name="pay-interval" />
          <ul className="space-y-1.5 text-sm">
            {BENEFITS.map((b) => <li key={b} className="flex gap-2"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--success-fg)]" />{b}</li>)}
          </ul>
          <dl className="space-y-1.5 border-t-[length:var(--border-w)] border-dashed border-[var(--line)] pt-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="font-bold">Heute fällig</dt><dd className="tabular text-lg font-extrabold" data-pay-amount>{amount}</dd></div>
            <div className="flex justify-between gap-3 text-muted"><dt>Danach</dt><dd className="tabular">{amount} {PER_INTERVAL[interval]}</dd></div>
            <p className="text-small text-muted">{termText(interval)}.</p>
          </dl>
        </aside>

        {/* Payment */}
        <section aria-labelledby="pay-method" className="panel space-y-5 p-5 lg:order-1">
          <h2 id="pay-method" className="text-heading flex items-center gap-2"><CreditCard size={18} aria-hidden /> Zahlungsart</h2>
          {phase.name === "error" ? (
            <div className="space-y-3">
              <StatusMessage tone="warning">{phase.message}</StatusMessage>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={<RefreshCw size={14} aria-hidden />} onClick={() => { setPhase({ name: "loading" }); setAttempt((a) => a + 1); }}>Nochmals versuchen</Button>
                <ButtonLink href="/kontakt" variant="ghost" size="sm">Kontakt aufnehmen</ButtonLink>
              </div>
            </div>
          ) : (
            <>
              {/* The Stripe iframe must stay laid out (it measures its container); the skeleton covers it until "ready". */}
              <div className="relative min-h-[260px]">
                <div ref={mountRef} data-payment-element />
                {phase.name !== "ready" && (
                  <div aria-busy="true" aria-label="Zahlungsformular wird geladen" className="absolute inset-0 space-y-3 bg-[var(--surface)]" data-pay-loading>
                    <div className="grid grid-cols-3 gap-2.5"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
                    <Skeleton className="h-4 w-24" /><Skeleton className="h-11" />
                    <div className="grid grid-cols-2 gap-3"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
                  </div>
                )}
              </div>
              <p className="text-small text-muted" data-pay-terms>
                Mit «Jetzt bezahlen» erlaubst du WendApply, {amount} {PER_INTERVAL[interval]} automatisch abzubuchen, bis du das Abo kündigst. Kündigen kannst du jederzeit unter «Abo verwalten».
              </p>
              {payError && <StatusMessage tone="danger">{payError}</StatusMessage>}
              <Button variant="sun" size="lg" full loading={paying} disabled={phase.name !== "ready" || !complete} onClick={pay} icon={<Lock size={16} aria-hidden />} data-pay-button>
                {paying ? "Zahlung läuft…" : `Jetzt bezahlen · ${amount}`}
              </Button>
              <p className="text-small flex items-start gap-2 text-muted">
                <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
                <span>Verschlüsselt über unseren Zahlungspartner Stripe. WendApply sieht deine Kartendaten nie. Mehr dazu in der <Link href="/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</Link>.</span>
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
