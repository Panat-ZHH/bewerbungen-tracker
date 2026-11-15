// File validation, in-memory text extraction and the daily-limit rule for the ai-review function.
// Pure module: no npm imports. The PDF and ZIP libraries are injected (Deno: npm:unpdf / npm:fflate,
// Node tests: the same packages from node_modules), so everything here is testable under Node.
import { ReviewFailure } from "./errors.ts";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MIN_TEXT_CHARS = 150;
export const MAX_TEXT_CHARS = 20_000;
export const MAX_COMPANY = 200;
export const MAX_BERUF = 200;
export const MAX_JOB_AD = 8000;

export type FileKind = "pdf" | "docx";

export interface ExtractDeps {
  /** Returns the files of a ZIP archive. `only` restricts which entries are inflated. */
  unzip: (bytes: Uint8Array, only?: (name: string) => boolean) => Record<string, Uint8Array>;
  /** Returns the text of a PDF (all pages merged). */
  pdfText: (bytes: Uint8Array) => Promise<string>;
}

const DOCX_MAIN = "word/document.xml";

const startsWith = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/**
 * Detects PDF / ZIP by magic bytes (the browser's MIME type and file name are not trusted).
 * A ZIP is only a DOCX if it contains word/document.xml – that is checked in extractText.
 */
export function sniffKind(bytes: Uint8Array): FileKind | "zip" | null {
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  // "%PDF-" – like PDF readers, accept it anywhere in the first 1024 bytes (some generators prepend junk).
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 5 <= head.length; i++) if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return "pdf";
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const cp = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    }
    return ENTITIES[ent] ?? m;
  });
}

/** Text of word/document.xml: w:t runs, w:tab, w:br / w:cr, one line per w:p. Deleted text (w:delText) is ignored. */
export function docxXmlToText(xml: string): string {
  const body = xml.replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "");
  const out: string[] = [];
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:p>/g;
  for (let m = token.exec(body); m; m = token.exec(body)) {
    const tag = m[0];
    if (m[1] !== undefined) out.push(decodeXmlEntities(m[1]));
    else if (tag.startsWith("<w:tab")) out.push("\t");
    else if (tag.startsWith("<w:br") || tag.startsWith("<w:cr")) out.push("\n");
    else if (tag === "</w:p>") out.push("\n");
  }
  return out.join("");
}

/** Normalises whitespace: unified newlines, no control characters, single spaces, at most one empty line. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t\f\v]/g, " ")
    .replace(/[­​-‍﻿]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Throws file_too_large / unsupported_file before any parsing. */
export function checkUpload(size: number, bytes?: Uint8Array): void {
  if (!Number.isFinite(size) || size <= 0) throw new ReviewFailure("unsupported_file", undefined, "empty file");
  if (size > MAX_FILE_BYTES) throw new ReviewFailure("file_too_large");
  if (bytes && sniffKind(bytes) === null) throw new ReviewFailure("unsupported_file", undefined, "magic bytes");
}

/** Length rules for the extracted text. */
export function checkTextLength(text: string): void {
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS || text.length < MIN_TEXT_CHARS) throw new ReviewFailure("no_text");
  if (text.length > MAX_TEXT_CHARS) throw new ReviewFailure("too_long");
}

/** Validates the bytes, extracts and cleans the text. Everything stays in memory; nothing is logged or stored. */
export async function extractApplicationText(bytes: Uint8Array, deps: ExtractDeps): Promise<{ kind: FileKind; text: string }> {
  checkUpload(bytes.length, bytes);
  const sniffed = sniffKind(bytes);
  let kind: FileKind;
  let raw: string;
  if (sniffed === "pdf") {
    kind = "pdf";
    try {
      raw = await deps.pdfText(bytes);
    } catch {
      // Encrypted or broken PDFs: we cannot read them, which for the pupil looks like "no text".
      throw new ReviewFailure("no_text", undefined, "pdf parse failed");
    }
  } else {
    let files: Record<string, Uint8Array>;
    try {
      files = deps.unzip(bytes, (name) => name === DOCX_MAIN);
    } catch {
      throw new ReviewFailure("unsupported_file", undefined, "zip parse failed");
    }
    const main = files[DOCX_MAIN];
    if (!main) throw new ReviewFailure("unsupported_file", undefined, "zip without word/document.xml");
    kind = "docx";
    raw = docxXmlToText(new TextDecoder("utf-8").decode(main));
  }
  const text = cleanText(raw);
  checkTextLength(text);
  return { kind, text };
}

/** Optional form fields: trimmed, empty → undefined, too long → bad_request. */
export function readOptionalField(value: unknown, max: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new ReviewFailure("bad_request", undefined, "field is not text");
  const v = value.trim();
  if (!v) return undefined;
  if (v.length > max) throw new ReviewFailure("bad_request", undefined, "field too long");
  return v;
}

/** File name as stored in ai_reviews: base name only, no control characters, max 255 chars. */
export function safeFileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  // deno-lint-ignore no-control-regex
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return base ? base.slice(0, 255) : null;
}

// ---- daily limit ----

/** Per-user setting wins; otherwise the env default; unset / invalid = no limit (null). */
export function resolveDailyLimit(userLimit: number | null | undefined, envDefault: string | undefined): number | null {
  if (typeof userLimit === "number" && Number.isInteger(userLimit) && userLimit >= 0) return userLimit;
  const raw = envDefault?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function isOverDailyLimit(countLast24h: number, limit: number | null): boolean {
  return limit !== null && countLast24h >= limit;
}

export function since24h(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}
