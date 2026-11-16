/**
 * Single source of truth for the public B2B marketing copy: tagline, positioning, packages, pilot terms.
 * Plain TS (no JSX) so tests can import it directly. Pricing is public; there is deliberately no online purchase or payment code here.
 * Swiss spelling only (ss, never the sharp s).
 */

export const TAGLINE = "Den Bewerbungsprozess sichtbar, planbar und motivierend machen.";
export const BRAND_TAGLINE = `WendApply · ${TAGLINE}`;
export const POSITIONING = "WendApply hilft Sekundarschulen, den Bewerbungsprozess ihrer Schülerinnen und Schüler übersichtlich zu organisieren und durch Gamification die Eigeninitiative zu fördern.";

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
  "Klassenziele, Klassendorf und Statistiken",
  "Datenschutz-Unterlagen inkl. AVV-Vorlage",
];

export const PACKAGES: Package[] = [
  { id: "starter", name: "Starter", maxStudents: 100, pricePerYear: 990, audience: "Kleine Schulen", features: [...core, "Support per E-Mail"] },
  { id: "professional", name: "Professional", maxStudents: 300, pricePerYear: 1490, audience: "Das Kernpaket für die meisten Sekundarschulen", recommended: true, features: [...core, "Persönliche Einführung für das Kollegium"] },
  { id: "enterprise", name: "Enterprise", maxStudents: 800, pricePerYear: 3990, audience: "Grosse Schulen mit erweiterter Administration", features: [...core, "Erweiterte Administration für die Schule", "Persönliche Einführung für das Kollegium"] },
];

export const PILOT = {
  days: 30,
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
