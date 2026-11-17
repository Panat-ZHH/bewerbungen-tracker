"use client";

/**
 * In-app payment of the Einzelabo on /abo (same technique as the family InAppCheckout): Stripe Checkout Session with
 * ui_mode "elements", Payment Element themed with the app's tokens, our own pay button. SCA/3DS runs in Stripe's modal;
 * redirect-based methods come back to /abo?billing=success (session return_url, set by the server). The webhook stays the
 * source of truth; AboView polls my_access after the return.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, RefreshCw } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { StripeCheckoutElementsSdk, StripeCheckoutLoadActionsSuccess } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { PER_INTERVAL, payAmountText, paymentErrorMessage } from "./logic";
import { soloDoneHref, soloPlan, startSoloInAppCheckout, type SoloInterval } from "./solo";
import { cssTokenReader, stripeAppearance, stripeFonts } from "./stripe-appearance";

type Phase = { name: "loading" } | { name: "ready" } | { name: "error"; message: string };

export function SoloPayForm({ interval, onCancel }: { interval: SoloInterval; onCancel: () => void }) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [complete, setComplete] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const mountRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<StripeCheckoutElementsSdk | null>(null);
  const actionsRef = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const secretRef = useRef("");

  useEffect(() => {
    let alive = true;
    setComplete(false); setPayError(""); setPhase({ name: "loading" }); // eslint-disable-line react-hooks/set-state-in-effect -- reset per new session
    (async () => {
      const [stripe, session] = await Promise.all([
        loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "", { locale: "de" }),
        startSoloInAppCheckout(interval),
      ]);
      if (!alive) return;
      if (!session.ok) { setPhase({ name: "error", message: session.message }); return; }
      if (!stripe) { setPhase({ name: "error", message: "Das Zahlungsformular konnte nicht geladen werden. Prüf deine Verbindung und versuch es nochmals." }); return; }
      secretRef.current = session.data.clientSecret;
      const checkout = stripe.initCheckoutElementsSdk({
        clientSecret: session.data.clientSecret,
        elementsOptions: { appearance: stripeAppearance(cssTokenReader()), fonts: stripeFonts(window.location.origin), loader: "never" },
      });
      checkoutRef.current = checkout;
      const element = checkout.createPaymentElement({
        layout: { type: "tabs" },
        wallets: { applePay: "auto", googlePay: "auto", link: "never" },
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
  }, [interval, attempt]);

  const pay = useCallback(async () => {
    const actions = actionsRef.current;
    if (!actions || paying) return;
    setPaying(true); setPayError("");
    // No returnUrl here: the session already has return_url (set by the server); passing it again makes confirm() hang.
    const result = await actions.confirm({ redirect: "if_required" });
    if (result.type === "success") { window.location.assign(soloDoneHref(secretRef.current)); return; }
    const e = result.error as { code?: string | null; message?: string; paymentFailed?: { declineCode: string | null } };
    setPayError(paymentErrorMessage({ code: e.code, declineCode: e.paymentFailed?.declineCode ?? null, message: e.message }));
    setPaying(false);
  }, [paying]);

  const amount = payAmountText(soloPlan(), interval);
  if (phase.name === "error") {
    return (
      <div className="space-y-3" data-testid="solo-pay-form" data-pay-state="error">
        <StatusMessage tone="warning">{phase.message}</StatusMessage>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} aria-hidden />} onClick={() => setAttempt((a) => a + 1)}>Nochmals versuchen</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Zurück</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4" data-testid="solo-pay-form" data-pay-state={phase.name}>
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
      <div className="flex items-start justify-between gap-3">
        <p className="text-small flex items-start gap-2 text-muted">
          <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span>Verschlüsselt über Stripe. WendApply sieht deine Kartendaten nie. Mehr in der <Link href="/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</Link>.</span>
        </p>
        <Button variant="ghost" size="sm" disabled={paying} onClick={onCancel}>Abbrechen</Button>
      </div>
    </div>
  );
}
