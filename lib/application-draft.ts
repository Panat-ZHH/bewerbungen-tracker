// Local drafts of the application form ("Zwischenstand"). Pure helpers, no browser APIs, so they can be unit-tested.
// The form keeps everything the user typed in localStorage while they work, so leaving the page, a reload or a crash
// never loses an unfinished form. A draft is dropped after a successful save or when the user discards it.

export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

/** One draft per account and per target: a new application ("new") or an existing one (its id). */
export function draftKey(userId: string, target: "new" | string): string {
  return `wendapply:application-draft:${userId}:${target}`;
}

export type StoredDraft<T> = { v: number; savedAt: number; form: T };

export function serializeDraft<T>(form: T, now = Date.now()): string {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, form } satisfies StoredDraft<T>);
}

/** Parses a stored draft. Returns null for missing, broken, outdated or foreign data; only keeps keys that exist in `blank` and are strings. */
export function parseDraft<T extends Record<string, string>>(raw: string | null, blank: T, now = Date.now()): { form: T; savedAt: number } | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredDraft<Record<string, unknown>>>;
    if (!data || data.v !== DRAFT_VERSION || typeof data.savedAt !== "number" || !data.form || typeof data.form !== "object") return null;
    if (now - data.savedAt > DRAFT_MAX_AGE_MS) return null;
    const form = { ...blank } as Record<string, string>;
    for (const key of Object.keys(blank)) {
      const value = (data.form as Record<string, unknown>)[key];
      if (typeof value === "string") form[key] = value;
    }
    return { form: form as T, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

/** True when the form differs from `base` (ignoring surrounding whitespace). */
export function isDirty<T extends Record<string, string>>(form: T, base: T): boolean {
  return (Object.keys(base) as (keyof T)[]).some((key) => (form[key] ?? "").trim() !== (base[key] ?? "").trim());
}
