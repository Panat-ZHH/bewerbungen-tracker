/**
 * Single source of truth for the public B2B marketing copy: tagline, positioning, packages, pilot terms.
 * Plain TS (no JSX) so tests can import it directly. Pricing is public; there is deliberately no online purchase or payment code here.
 * Swiss spelling only (ss, never the sharp s).
 */
import { PILOT_DAYS } from "../../lib/b2b/licence.ts";
import { PLANS, formatChf, yearlySavingChf } from "../../lib/billing/plans.ts";

export const TAGLINE = "Den Bewerbungsprozess sichtbar, planbar und motivierend machen.";
export const BRAND_TAGLINE = `WendApply · ${TAGLINE}`;
export const POSITIONING = "WendApply hilft Sekundarschulen, den Bewerbungsprozess ihrer Schülerinnen und Schüler übersichtlich zu organisieren und durch Gamification die Eigeninitiative zu fördern.";

/** Signup/login entry points of the public site (own tiny module so the client-side mobile menu does not pull in the plans). */
export { SIGNUP_HREF, LOGIN_HREF, SIGNUP_LABEL, LOGIN_LABEL, withNext } from "./auth-links.ts";

/** The one contact address of the public site (Kontakt, Hilfe, demos, offers, pilot). public-shell.tsx re-exports it. */
export const CONTACT_EMAIL = "info.wendico@gmail.com";

export type Package = {
  id: "starter" | "professional" | "enterprise";
  name: string;
  maxStudents: number;
  pricePerYear: number;
  audience: string;
  recommended?: boolean;
  features: string[];
};

const core = [
  "Alle Funktionen für Schülerinnen und Schüler",
  "Klassenübersicht und Begleitung für Lehrpersonen",
  "Klassenziele, Klassendorf und Auswertungen",
  "Datenschutz-Unterlagen inkl. AVV-Vorlage",
];

export const PACKAGES: Package[] = [
  { id: "starter", name: "Starter", maxStudents: PLANS.starter.studentLimit!, pricePerYear: PLANS.starter.priceChfPerYear!, audience: "Kleine Schulen", features: [...core, "Support per E-Mail"] },
  { id: "professional", name: "Professional", maxStudents: PLANS.professional.studentLimit!, pricePerYear: PLANS.professional.priceChfPerYear!, audience: "Das Kernpaket für die meisten Sekundarschulen", recommended: true, features: [...core, "Persönliche Einführung für das Kollegium"] },
  { id: "enterprise", name: "Enterprise", maxStudents: PLANS.enterprise.studentLimit!, pricePerYear: PLANS.enterprise.priceChfPerYear!, audience: "Grosse Schulen mit erweiterter Administration", features: [...core, "Erweiterte Administration für die Schule", "Persönliche Einführung für das Kollegium"] },
];

export const PILOT = {
  days: PILOT_DAYS,
  classes: "1 bis 2 Klassen",
  /** Already promised on the live site before the B2B plan ("kostenloser Pilot"). Open question in docs/b2b/REPORT-b2b-site.md. */
  free: true,
};

/** Swiss number format with apostrophe: 1490 -> "1'490". */
export function chf(n: number, decimals = 0): string {
  const [int, frac] = n.toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Price per student and month at full capacity, rounded to the Rappen (Professional: 1490 / 300 / 12 = 0.41). */
export function perStudentMonth(p: Pick<Package, "pricePerYear" | "maxStudents">): number {
  return Math.round((p.pricePerYear / p.maxStudents / 12) * 100) / 100;
}

/** Price per student and year at full capacity (Professional: 4.97). */
export function perStudentYear(p: Pick<Package, "pricePerYear" | "maxStudents">): number {
  return Math.round((p.pricePerYear / p.maxStudents) * 100) / 100;
}

export function mailto(subject: string, body?: string): string {
  const q = [`subject=${encodeURIComponent(subject)}`];
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${CONTACT_EMAIL}?${q.join("&")}`;
}

const schoolBody = "Schule:\nOrt / Kanton:\nAnzahl Schülerinnen und Schüler (ca.):\nAnsprechperson und Telefon:\n\nNachricht:\n";

export const MAIL = {
  demo: mailto("WendApply: Demo buchen", `Wir möchten WendApply in einer Live-Demo kennenlernen.\n\n${schoolBody}`),
  offer: (pkg?: string) => mailto(`WendApply: Offerte anfragen${pkg ? ` (${pkg})` : ""}`, `Bitte senden Sie uns eine Offerte${pkg ? ` für das Paket ${pkg}` : ""}.\n\n${schoolBody}`),
  multi: mailto("WendApply: Angebot für mehrere Standorte", `Wir interessieren uns für ein Angebot für mehrere Standorte bzw. einen Schulverband.\n\nAnzahl Standorte:\n${schoolBody}`),
  pilot: mailto("WendApply: 30-Tage-Pilot anfragen", `Wir möchten WendApply mit 1 bis 2 Klassen 30 Tage lang testen.\n\nKlassen / Stufe:\nGewünschter Start:\n${schoolBody}`),
};

/**
 * Familien / Privatkunden (parents and independent young people). Price decided by Panat on 2026-11-16 and read from
 * PLANS.family (lib/billing/plans.ts): CHF 7.90 per month or CHF 79 per year (no VAT). Online purchase only when the
 * payment flag is on; otherwise access is still granted manually (waitlist).
 */
export const FAMILY = {
  name: PLANS.family.name,
  seatsParents: PLANS.family.seats?.parents ?? 1,
  seatsChildren: PLANS.family.seats?.children ?? 1,
  pricePerYear: PLANS.family.priceChfPerYear as number | null,
  pricePerMonth: (PLANS.family.priceChfPerMonth ?? null) as number | null,
  /** "CHF 7.90" / "CHF 79" / "CHF 15.80" (saving per year vs. 12 monthly payments). */
  priceMonthText: formatChf(PLANS.family.priceChfPerMonth ?? 0),
  priceYearText: formatChf(PLANS.family.priceChfPerYear ?? 0),
  savingText: formatChf(yearlySavingChf(PLANS.family)),
  status: "bald verfügbar",
  features: [
    "1 Schüleraccount",
    "1 Elternaccount",
    "Gemeinsame Bewerbungsübersicht",
    "Unterstützung und Begleitung durch die Eltern",
    "Alle Family-Funktionen: Stellen, Bewerbungen, Fristen, Dorf, Einwilligung für Kinder unter 16, Export und Löschung",
  ],
};

/** Value sent as p_kind to the RPC waitlist_join from the Familien page. */
export const WAITLIST_KIND_FAMILY = "family";

export const MAIL_FAMILY = mailto(
  "WendApply: Zugang anfragen (Familien)",
  "Ich interessiere mich für WendApply für Familien.\n\nIch bin: Elternteil / Jugendliche:r\n\nNachricht:\n",
);
