/** Pure name helpers shared by UI and tests (P0 item 6). No Supabase import. */

export const FALLBACK_STUDENT_NAME = "Schüler:in";

/** True for names that are just the sign-up fallback: empty, "Nutzer", an e-mail address or its local part ("u0123", "max.muster88"). */
export function isPlaceholderName(name?: string | null, email?: string | null): boolean {
  const n = (name ?? "").trim();
  if (!n || n.toLowerCase() === "nutzer") return true;
  if (n.includes("@")) return true;
  const local = (email ?? "").split("@")[0].trim().toLowerCase();
  return Boolean(local) && n.toLowerCase() === local;
}

/** Name to display: teacher alias first, then the real display name, never an e-mail or "U0". */
export function shownName(input: { alias?: string | null; displayName?: string | null; email?: string | null }, fallback = FALLBACK_STUDENT_NAME): string {
  const alias = (input.alias ?? "").trim();
  if (alias) return alias;
  const name = (input.displayName ?? "").trim();
  if (isPlaceholderName(name, input.email)) return fallback;
  return name;
}

/** Up to two initials from the first and last word of a real name. Words must start with a letter ("U0" -> "U"). */
export function initialsFromName(name?: string | null): string {
  const parts = (name ?? "").replace(/@.*/, "").split(/[\s._-]+/).filter((p) => /^\p{L}/u.test(p));
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** Splits "Vorname Nachname" input into one trimmed name; returns null when it is unusable (empty, e-mail, > 60 chars). */
export function cleanNameInput(first: string, last = ""): string | null {
  const full = `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
  if (!full || full.length > 60 || full.includes("@")) return null;
  return full;
}

