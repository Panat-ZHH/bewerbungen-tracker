// Pure helpers for "Meine Dokumente" (no Supabase) so they can be unit-tested.
import type { DocumentKind } from "../types/index.ts";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const DOCUMENT_KINDS: { kind: DocumentKind; label: string; plural: string; hint: string; photoOnly?: boolean }[] = [
  { kind: "lebenslauf", label: "Lebenslauf", plural: "Lebenslauf", hint: "Dein aktueller Lebenslauf als PDF." },
  { kind: "motivationsschreiben", label: "Motivationsschreiben", plural: "Motivationsschreiben", hint: "Dein Brief an die Firma. Du kannst mehrere Versionen speichern." },
  { kind: "zeugnisse", label: "Zeugnis", plural: "Zeugnisse", hint: "Die letzten Schulzeugnisse, auch Schnupper- oder Praktikumsberichte." },
  { kind: "foto", label: "Foto", plural: "Foto", hint: "Ein Bewerbungsfoto als JPG oder PNG.", photoOnly: true },
  { kind: "sonstiges", label: "Weiteres Dokument", plural: "Sonstiges", hint: "Zum Beispiel Checks, Zertifikate oder Empfehlungen." },
];

/** What a complete Dossier needs. "sonstiges" is optional. */
export const DOSSIER_KINDS: DocumentKind[] = ["lebenslauf", "motivationsschreiben", "zeugnisse", "foto"];

export const kindLabel = (kind: DocumentKind) => DOCUMENT_KINDS.find((item) => item.kind === kind)?.label ?? "Dokument";

export function validateDocumentFile(file: { name: string; size: number; type: string }, kind: DocumentKind): string | null {
  if (file.size <= 0) return "Die Datei ist leer.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Die Datei ist grösser als 5 MB. Verkleinere sie oder wähle eine andere.";
  const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : /\.png$/i.test(file.name) ? "image/png" : "");
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(type)) return "Dieses Format wird nicht unterstützt. Nutze PDF, JPG oder PNG.";
  if (kind === "foto" && type === "application/pdf") return "Für das Foto brauchst du eine JPG- oder PNG-Datei.";
  return null;
}

/** Storage-safe file name: no folders, no odd characters, never empty. */
export function safeFileName(name: string): string {
  const cleaned = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").replace(/^\.+/, "").slice(-100);
  return cleaned || "dokument";
}

export type DossierItem = { kind: DocumentKind; label: string; done: boolean };

/** Checklist for one application: a row is done when at least one attached document has that kind. */
export function dossierChecklist(attachedKinds: DocumentKind[]): { items: DossierItem[]; done: number; total: number } {
  const have = new Set(attachedKinds);
  const items = DOSSIER_KINDS.map((kind) => ({ kind, label: DOCUMENT_KINDS.find((item) => item.kind === kind)!.plural, done: have.has(kind) }));
  return { items, done: items.filter((item) => item.done).length, total: items.length };
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
