"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/components/public/marketing";
import { cooldownLeft, formatCountdown, loginHref, RESEND_MAX } from "./funnel-core";
import { callbackUrl, loadFunnelState, readConfirmRecord } from "./store";
import { BrandMark } from "@/components/ui/brand-mark";
import { JourneyTile } from "./journey-path";

const SENT_TEXT = "Falls die Adresse stimmt, ist eine neue E-Mail unterwegs.";
const WAIT_TEXT = "Bitte warte noch etwas, bevor du es noch einmal versuchst.";

function isRateLimit(error: { status?: number; code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return error.status === 429 || /rate.?limit|too many|security purposes|over_email_send/.test(text);
}

/**
 * /start/bestaetigen (SPEC-FLOW §4.6, SPEC-DATA §3.10). Shows the address from sessionStorage only. Resend: 60 s cooldown after
 * load and after each send, max 3 per visit; success and every non-rate-limit error show the same neutral text (no enumeration).
 */
export function ConfirmEmail() {
  const router = useRouter();
  const [record, setRecord] = useState<{ email: string; at: number } | null | undefined>(undefined);
  const [lastAt, setLastAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [sends, setSends] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [live, setLive] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const left = cooldownLeft(lastAt, now);
  const maxed = sends >= RESEND_MAX;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
    setRecord(readConfirmRecord());
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [left]);

  // Announce only the start and the end of the cooldown, not every second.
  const wasCooling = useRef(true);
  useEffect(() => {
    const cooling = left > 0;
    if (wasCooling.current && !cooling) setLive("Du kannst die E-Mail jetzt nochmals senden.");
    wasCooling.current = cooling;
  }, [left]);

  async function resend() {
    if (!record || busy || left > 0 || maxed) return;
    setBusy(true); setStatus(null);
    let limited = false;
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: record.email, options: { emailRedirectTo: callbackUrl(loadFunnelState()?.next ?? null, { email: true }) } });
      limited = isRateLimit(error);
    } catch { /* same neutral text */ }
    setBusy(false);
    setSends((n) => n + 1);
    const at = Date.now();
    setLastAt(at); setNow(at);
    setStatus(limited ? { tone: "warning", text: WAIT_TEXT } : { tone: "info", text: SENT_TEXT });
    setLive(`${limited ? WAIT_TEXT : SENT_TEXT} Nochmals senden geht in einer Minute wieder.`);
  }

  const next = record === undefined ? null : loadFunnelState()?.next ?? null;
  const login = loginHref(next);

  return (
    <main data-ui="app" className="workspace-bg min-h-[100dvh] px-4 pb-10 sm:px-6">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="flex min-h-14 items-center">
          <Link href="/" className="flex min-h-11 items-center gap-2" aria-label="WendApply Startseite"><BrandMark size={32} priority /><span className="font-display text-lg font-extrabold tracking-[-.03em]">WendApply</span></Link>
        </header>
        <div className="animate-rise pt-6 lg:pt-12" data-testid="confirm-page">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 ref={headingRef} tabIndex={-1} className="text-title outline-none">Schau in dein Postfach</h1>
            </div>
            {/* Sized wrapper: styles.journey (width:100%) beats utility widths on the svg itself (B1, h1 collapsed to 0 px). */}
            <div className="w-20 shrink-0 sm:w-[120px]" aria-hidden><JourneyTile milestone="bewerben" /></div>
          </div>

          {record === undefined ? (
            <p role="status" className="mt-6 flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p>
          ) : (
            <div className="mt-4 space-y-4 text-body">
              {record ? (
                <p data-testid="confirm-text">Wir haben dir eine E-Mail an <strong className="[overflow-wrap:anywhere]" data-testid="confirm-email">{record.email}</strong> geschickt. Tipp auf den Link darin, dann geht’s los.</p>
              ) : (
                <p data-testid="confirm-text">Wir haben dir eine E-Mail geschickt. Tipp auf den Link darin, dann geht’s los.</p>
              )}
              <p className="text-muted">Nichts bekommen? Schau auch im Spam-Ordner nach. Der Link in der E-Mail gilt eine Stunde.</p>

              {record && (
                <div className="panel space-y-3 p-4">
                  {!maxed ? (
                    <Button variant="secondary" size="lg" full onClick={resend} loading={busy} disabled={left > 0} data-testid="confirm-resend" aria-describedby="confirm-resend-status">
                      {busy ? "Einen Moment …" : left > 0 ? <>Nochmals senden in <span className="tabular" aria-hidden>{formatCountdown(left)}</span><span className="sr-only">{left} Sekunden</span></> : "E-Mail nochmals senden"}
                    </Button>
                  ) : (
                    <p data-testid="confirm-maxed" className="text-small">Du hast die E-Mail schon mehrmals angefordert. Prüf die Adresse oder schreib uns an <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-2">{CONTACT_EMAIL}</a>.</p>
                  )}
                  <p id="confirm-resend-status" data-testid="confirm-status" className={status?.tone === "warning" ? "text-small font-medium text-[var(--warning-fg)]" : "text-small font-medium text-[var(--info-fg)]"}>{status?.text ?? ""}</p>
                  <Button variant="ghost" size="lg" full onClick={() => router.push("/start?schritt=konto")} data-testid="confirm-change-email">E-Mail-Adresse ändern</Button>
                </div>
              )}
              <p className="sr-only" aria-live="polite">{live}</p>

              <p className="text-small text-muted">Hast du mit dieser Adresse schon ein Konto? Dann <Link href={login} className="font-semibold text-[var(--ink)] underline underline-offset-2">melde dich an</Link>. Passwort vergessen? Das kannst du dort zurücksetzen.</p>
              <p className="text-small text-muted">Hast du die E-Mail auf einem anderen Gerät geöffnet? Dann melde dich hier mit deiner E-Mail-Adresse und deinem Passwort an.</p>
              <p><Link href={login} data-testid="confirm-login" className="inline-flex min-h-11 items-center font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4">Anmelden</Link></p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
