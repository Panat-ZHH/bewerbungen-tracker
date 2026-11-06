// Pure helpers for the student onboarding (no browser/Supabase imports so node --test can load them).

export const SCHOOL_LEVELS = [
  "7. Klasse", "8. Klasse", "9. Klasse – Sek A / Bezirk", "9. Klasse – Sek B / Real", "9. Klasse – Sek C / Werkklasse",
  "9. Klasse – Gymnasium", "10. Schuljahr / Brückenangebot", "Schon in einer Lehre / Ausbildung", "Etwas anderes",
] as const;

/** Suggestions for the Wunschberufe chips (taken from the search categories + common apprenticeships). */
export const PROFESSION_SUGGESTIONS = [
  "Informatiker:in", "Kauffrau / Kaufmann", "Detailhandelsfachfrau / -mann", "Fachperson Gesundheit", "Fachperson Betreuung",
  "Elektroinstallateur:in", "Polymechaniker:in", "Koch / Köchin", "Maurer:in", "Zeichner:in", "Logistiker:in", "Gärtner:in", "Mediamatiker:in", "Medizinische Praxisassistenz",
] as const;

export const MAX_PROFESSIONS = 8;

export interface OnboardingAnswers {
  firstName: string;
  lastName: string;
  schoolLevel: string;
  professions: string[];
  canton: string;
  place: string;
  startYear: number | null;
}

export const emptyAnswers = (): OnboardingAnswers => ({ firstName: "", lastName: "", schoolLevel: "", professions: [], canton: "", place: "", startYear: null });

/** Years offered for "Lehrbeginn": this year (if before October) through +3. */
export function startYearOptions(now = new Date()): number[] {
  const base = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  return [base, base + 1, base + 2, base + 3];
}

/** Adds a chip: trims, caps length, ignores empty/duplicates (case-insensitive) and respects the maximum. */
export function addProfession(list: string[], raw: string): string[] {
  const value = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!value || list.length >= MAX_PROFESSIONS || list.some((item) => item.toLowerCase() === value.toLowerCase())) return list;
  return [...list, value];
}
export const removeProfession = (list: string[], value: string) => list.filter((item) => item !== value);

export function hasAnyAnswer(a: OnboardingAnswers): boolean {
  return !!(a.firstName.trim() || a.lastName.trim() || a.schoolLevel || a.professions.length || a.canton || a.place.trim() || a.startYear);
}

/** What the job search starts with (only used when the URL carries no search of its own). */
export interface SearchPrefill { query: string; location: string; cantons: string[]; startYear?: number }
export function searchPrefill(a: Pick<OnboardingAnswers, "professions" | "canton" | "place" | "startYear">): SearchPrefill | null {
  const query = a.professions[0]?.trim() ?? "";
  const location = a.place.trim();
  const cantons = !location && a.canton ? [a.canton.toUpperCase()] : [];
  if (!query && !location && !cantons.length) return null;
  return { query, location, cantons, ...(a.startYear ? { startYear: a.startYear } : {}) };
}

/** Same idea, but from the stored profile row (used after a fresh login on another device). */
export function parsePrefill(raw: string | null): SearchPrefill | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SearchPrefill>;
    if (typeof v.query !== "string" || typeof v.location !== "string" || !Array.isArray(v.cantons)) return null;
    return { query: v.query.slice(0, 100), location: v.location.slice(0, 80), cantons: v.cantons.filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)).slice(0, 3), ...(typeof v.startYear === "number" ? { startYear: v.startYear } : {}) };
  } catch { return null; }
}

/** Short German sentence for the invite banner on the login page. */
export function inviteSentence(teacherName: string, className: string): string {
  const teacher = teacherName.trim() || "deiner Lehrperson";
  return `Du wurdest von ${teacher} in Klasse ${className.trim()} eingeladen`;
}
