import { readFile } from "node:fs/promises";
import path from "node:path";

/** Single source of truth for the legal documents: the Markdown files in docs/legal/. */
export const LEGAL_STAND = "6. November 2026";
export const LEGAL_VERSION = "0.9 (Entwurf)";
export const LEGAL_CONTACT = "info.wendico@gmail.com";

export type LegalKey = "datenschutz" | "jugend" | "schulen" | "avv" | "hosting" | "loeschkonzept";

export const LEGAL_DOCS: { key: LegalKey; file: string; path: string; title: string; short: string; description: string }[] = [
  { key: "datenschutz", file: "datenschutzerklaerung.md", path: "/datenschutz", title: "Datenschutzerklärung", short: "Datenschutz", description: "Welche Daten WendApply bearbeitet, warum, wer sie sieht und welche Rechte du hast." },
  { key: "jugend", file: "datenschutz-jugend.md", path: "/datenschutz-jugend", title: "Datenschutz für Jugendliche", short: "Für Jugendliche", description: "Die Kurzfassung in einfacher Sprache." },
  { key: "schulen", file: "datenschutz-schulen.md", path: "/datenschutz-schulen", title: "Datenschutz für Schulen", short: "Für Schulen", description: "Rollen, Rechtsrahmen, Zugriffe und Massnahmen für Schulen und Lehrpersonen." },
  { key: "avv", file: "avv.md", path: "/avv", title: "Auftragsbearbeitung (AVV/DPA)", short: "AVV", description: "Vorlage für die Vereinbarung zur Auftragsbearbeitung mit Schulen." },
  { key: "hosting", file: "hosting.md", path: "/hosting", title: "Hosting und Unterauftragsbearbeiter", short: "Hosting", description: "Wo die Daten liegen und welche Dienstleister beteiligt sind." },
  { key: "loeschkonzept", file: "loeschkonzept.md", path: "/loeschkonzept", title: "Löschkonzept am Klassenende", short: "Löschkonzept", description: "Was wann gelöscht wird und wer es auslöst." },
];

export function legalDoc(key: LegalKey) {
  const doc = LEGAL_DOCS.find((d) => d.key === key);
  if (!doc) throw new Error(`Unknown legal document: ${key}`);
  return doc;
}

export async function readLegalMarkdown(key: LegalKey): Promise<string> {
  return readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "docs", "legal", legalDoc(key).file), "utf8");
}
