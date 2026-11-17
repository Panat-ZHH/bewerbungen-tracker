"use client";

import Link from "next/link";
import { Download, Heart, Lock, Mail, School, ShieldAlert, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ABO_PATH, CONTACT_PATH, SUPPORT_EMAIL } from "@/lib/access/gate";
import type { AccessInfo } from "@/lib/access/types";

function GateFrame({ testId, icon, title, children }: { testId: string; icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section data-testid={testId} aria-labelledby={`${testId}-title`} className="mx-auto max-w-[640px] py-4 sm:py-8">
      <div className="panel space-y-5 p-5 shadow-[var(--shadow-lg)] sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-xs)] [&>svg]:h-6 [&>svg]:w-6" aria-hidden>{icon}</span>
        <h1 id={`${testId}-title`} className="text-display text-[clamp(1.9rem,4.5vw,2.6rem)] leading-[1.05]">{title}</h1>
        {children}
      </div>
    </section>
  );
}

const linkClass = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

/** What stays possible without access: export, delete, log out (shown on the paywall and the licence gate). */
function StillPossible() {
  return (
    <p className="flex items-start gap-2 text-small text-muted">
      <Download size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>Deine Daten bleiben gespeichert. In den <Link href="/settings" className={linkClass}>Einstellungen</Link> kannst du sie jederzeit exportieren oder dein Konto löschen.</span>
    </p>
  );
}

/** Headline + first sentence of the paywall, per reason (G12, G14). */
export function paywallCopy(access: AccessInfo | null): { title: React.ReactNode; text: string; showPrices: boolean } {
  switch (access?.expired_reason) {
    case "family_pending":
      return { title: <>Fast <span className="marker">geschafft</span></>, text: "Du bist mit deiner Familie verbunden. Sobald deine Eltern das Familienpaket gebucht haben, kannst du WendApply wieder nutzen.", showPrices: false };
    case "licence_ended":
      return { title: <>Die Schullizenz ist <span className="marker">abgelaufen</span></>, text: "Die Lizenz deiner Schule gilt nicht mehr. Frag deine Lehrperson, ob die Schule verlängert. Oder nutze WendApply mit einem eigenen Abo weiter.", showPrices: true };
    case "subscription_ended":
      return { title: <>Dein Abo ist <span className="marker">abgelaufen</span></>, text: "Dein Abo ist nicht mehr aktiv. Mit einem neuen Abo geht es sofort weiter.", showPrices: true };
    case "payment_failed":
      return { title: <>Zahlung <span className="marker">fehlgeschlagen</span></>, text: "Wir konnten dein Abo nicht abbuchen. Aktualisiere deine Zahlungsart oder wähle ein neues Abo.", showPrices: true };
    default:
      return access?.subscription
        ? { title: <>Dein Abo ist <span className="marker">abgelaufen</span></>, text: "Dein Abo ist nicht mehr aktiv. Mit einem neuen Abo geht es sofort weiter.", showPrices: true }
        : { title: <>Deine Testwoche ist <span className="marker">vorbei</span></>, text: "Die 7 Tage gratis sind um. Damit du WendApply weiter nutzen kannst, brauchst du ein Abo.", showPrices: true };
  }
}

/** Wrong role at signup (G7): switch once via the picker (set_my_role refuses when classes exist). */
function WrongRole() {
  return <p className="text-small text-muted">Falsche Rolle gewählt? <Link href="/auth/role?wechseln=1" className={linkClass}>Rolle ändern</Link></p>;
}

/** Trial or subscription is over (students and parents). */
export function Paywall({ access }: { access: AccessInfo | null }) {
  const parent = access?.account_type === "parent";
  const copy = paywallCopy(access);
  return (
    <GateFrame testId="paywall" icon={<Lock />} title={copy.title}>
      <p className="text-body" data-reason={access?.expired_reason ?? "none"}>{parent && copy.showPrices ? copy.text.replace("ein Abo", "das Familienpaket") : copy.text}</p>
      {copy.showPrices && (
        <ul className="space-y-1.5 text-body">
          {parent ? (
            <li className="flex gap-2"><Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden /><span><strong>Familienpaket</strong>: CHF 7.90 pro Monat oder CHF 79 pro Jahr, für dich und dein Kind.</span></li>
          ) : (<>
            <li className="flex gap-2"><Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden /><span><strong>Einzelabo</strong>: CHF 4.90 pro Monat oder CHF 49 pro Jahr.</span></li>
            <li className="flex gap-2"><Heart size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden /><span>Oder deine Eltern buchen das <strong>Familienpaket</strong>. <Link href="/familie" className={linkClass}>Eltern einladen</Link></span></li>
            <li className="flex gap-2"><School size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden /><span>Hat deine Schule eine Lizenz? Dann tritt der Klasse bei. <Link href="/classes" className={linkClass}>Klassencode eingeben</Link></span></li>
          </>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {copy.showPrices
          ? <ButtonLink href={parent ? "/familie#abo" : ABO_PATH} size="lg" data-primary-action="">{parent ? "Familienpaket wählen" : "Abo wählen"}</ButtonLink>
          : <ButtonLink href="/familie" size="lg" data-primary-action="">Zur Familie</ButtonLink>}
        <ButtonLink href={CONTACT_PATH} size="lg" variant="ghost">Fragen? Schreib uns</ButtonLink>
      </div>
      <StillPossible />
      <WrongRole />
    </GateFrame>
  );
}

/** Teacher / school admin without a valid school licence. `email`: shown so the school admin can add exactly this login. */
export function LicenceGate({ access = null, email }: { access?: AccessInfo | null; email?: string | null }) {
  const ended = access?.expired_reason === "licence_ended";
  return (
    <GateFrame testId="licence-gate" icon={<School />} title={<>Zugang nur mit <span className="marker">Schullizenz</span></>}>
      <p className="text-body">
        {ended ? "Die Lizenz deiner Schule ist abgelaufen. Sobald die Schule verlängert, kannst du WendApply wieder nutzen." : "Lehrpersonen und Schulen nutzen WendApply mit einer Schullizenz. Für dein Konto ist noch keine gültige Lizenz hinterlegt."}
      </p>
      {email && <p className="text-body">Hat deine Schule schon eine Lizenz? Gib deiner Schuladministration diese Adresse:<strong className="mt-1 block [overflow-wrap:anywhere]">{email}</strong></p>}
      <p className="text-body">
        Möchte deine Schule WendApply nutzen, oder hat sie schon eine Lizenz? Schreib uns an <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>{SUPPORT_EMAIL}</a>. Wir schalten dich frei.
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Schullizenz WendApply")}`} size="lg" icon={<Mail size={16} aria-hidden />} data-primary-action="">E-Mail schreiben</ButtonLink>
        <ButtonLink href={CONTACT_PATH} size="lg" variant="secondary">Kontakt</ButtonLink>
        <ButtonLink href="/schulen" size="lg" variant="ghost">Angebot für Schulen</ButtonLink>
      </div>
      <StillPossible />
      <WrongRole />
    </GateFrame>
  );
}

/** Account blocked by a WendApply admin. Login works so the message can be read. */
export function Blocked() {
  return (
    <GateFrame testId="blocked-page" icon={<ShieldAlert />} title={<>Konto <span className="marker">gesperrt</span></>}>
      <p className="text-body">Dein Konto ist im Moment gesperrt. Wenn du denkst, dass das ein Fehler ist, melde dich bei uns.</p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Konto gesperrt")}`} size="lg" icon={<Mail size={16} aria-hidden />}>{SUPPORT_EMAIL}</ButtonLink>
        <ButtonLink href={CONTACT_PATH} size="lg" variant="secondary">Kontakt</ButtonLink>
      </div>
      <p className="text-small text-muted">Deine Rechte bleiben: In den <Link href="/settings" className={linkClass}>Einstellungen</Link> kannst du deine Daten exportieren oder dein Konto löschen.</p>
    </GateFrame>
  );
}

/** The full-page replacement for a page the user may not open. */
export function AccessGatePage({ view, access, email }: { view: "paywall" | "licence" | "blocked"; access: AccessInfo | null; email?: string | null }) {
  if (view === "blocked") return <Blocked />;
  if (view === "licence") return <LicenceGate access={access} email={email} />;
  return <Paywall access={access} />;
}
