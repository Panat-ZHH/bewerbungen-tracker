// Pure helpers for "Konto löschen" – shared by the settings UI, the route handler and the tests.
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from "./password-policy.ts";

export const DELETE_CONFIRM_WORD = "LÖSCHEN";
/** The sign-in used to authorise the deletion must not be older than this. */
export const REAUTH_MAX_AGE_SECONDS = 5 * 60;
export const REAUTH_FLAG = "wendapply:delete-reauth";

export type AccountSummary = {
  role: "student" | "teacher";
  applications: number;
  documents: number;
  friends: number;
  classes_joined: number;
  classes_owned: number;
  students_in_owned_classes: number;
};

/** Case-insensitive match of the typed word (or the account e-mail), ignoring surrounding spaces. */
export function confirmationMatches(input: string, email?: string | null): boolean {
  const typed = input.trim().toLocaleUpperCase("de-CH");
  if (!typed) return false;
  if (typed === DELETE_CONFIRM_WORD || typed === "LOESCHEN") return true;
  return Boolean(email) && input.trim().toLowerCase() === String(email).trim().toLowerCase();
}

function claims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const bin = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Record<string, unknown>;
  } catch { return null; }
}

/**
 * Seconds since the user last proved their identity (password or Google), read from the JWT's `amr` claim.
 * A refreshed token keeps the old timestamps, so this really is "last sign-in", not "last token refresh".
 * Call this only with a token that has been verified (auth.getUser(token)).
 */
export function secondsSinceSignIn(token: string, nowMs = Date.now()): number | null {
  const amr = claims(token)?.amr;
  if (!Array.isArray(amr)) return null;
  const stamps = amr.map((e) => (e && typeof e === "object" ? Number((e as { timestamp?: unknown }).timestamp) : NaN)).filter((n) => Number.isFinite(n) && n > 0);
  if (!stamps.length) return null;
  return Math.max(0, Math.floor(nowMs / 1000 - Math.max(...stamps)));
}

export function isFreshSignIn(token: string, nowMs = Date.now()): boolean {
  const age = secondsSinceSignIn(token, nowMs);
  return age !== null && age <= REAUTH_MAX_AGE_SECONDS;
}

/** Sign-in methods (`amr[].method`) of the token that are not older than REAUTH_MAX_AGE_SECONDS. */
export function freshSignInMethods(token: string, nowMs = Date.now()): string[] {
  const amr = claims(token)?.amr;
  if (!Array.isArray(amr)) return [];
  const now = nowMs / 1000;
  return amr.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const { method, timestamp } = e as { method?: unknown; timestamp?: unknown };
    const t = Number(timestamp);
    return typeof method === "string" && Number.isFinite(t) && t > 0 && now - t <= REAUTH_MAX_AGE_SECONDS ? [method] : [];
  });
}

type IdentityInfo = { identities?: { provider?: string | null }[] | null; app_metadata?: Record<string, unknown> | null };

/** true when the account was created with / linked to e-mail + password (not only Google). Server-side data only. */
export function hasEmailLogin(user: IdentityInfo | null | undefined): boolean {
  if (!user) return false;
  const providers = new Set<string>();
  for (const i of user.identities ?? []) if (typeof i?.provider === "string") providers.add(i.provider);
  const meta = user.app_metadata ?? {};
  if (typeof meta.provider === "string") providers.add(meta.provider);
  if (Array.isArray(meta.providers)) for (const p of meta.providers) if (typeof p === "string") providers.add(p);
  return providers.has("email");
}

/**
 * Re-authentication check of the account deletion (server side, with the VERIFIED user).
 * A fresh "password" sign-in only counts for accounts that really log in with e-mail + password. Supabase lets anyone
 * holding a session ADD a password to a Google-only account without proving anything (no current password exists),
 * then sign in with it – that must not unlock the irreversible deletion. Google accounts re-authenticate with Google
 * (amr "oauth") or an e-mail link (otp / recovery / magiclink).
 */
export function isFreshReauth(token: string, user: IdentityInfo | null | undefined, nowMs = Date.now()): boolean {
  const emailLogin = hasEmailLogin(user);
  return freshSignInMethods(token, nowMs).some((method) => method !== "password" || emailLogin);
}

/** German bullet list of what is deleted, tailored to the counts of this account (display strings only). */
export function deletionItems(s: AccountSummary | null, kind?: "parent"): string[] {
  if (kind === "parent") return [
    "Dein Elternkonto und dein Profil mit Profilbild",
    "Deine Verbindung zur Familie – dein Kind sieht dich danach nicht mehr in seiner Familie",
    "Das Familienpaket läuft danach nicht mehr über dein Konto – ein laufendes Abo kündigst du vorher unter «Familie»",
    "Deine Anmeldung (E-Mail oder Google-Verknüpfung)",
  ];
  const n = (count: number | undefined, one: string, many: string) => (count === undefined ? many : count === 1 ? `1 ${one}` : `${count} ${many}`);
  const items = [
    s ? `${n(s.applications, "Bewerbung", "Bewerbungen")} samt Notizen, Kontakten, Fristen und Verlauf` : "Alle Bewerbungen samt Notizen, Kontakten, Fristen und Verlauf",
    s ? `${n(s.documents, "Dokument", "Dokumente")} (Lebenslauf und Anhänge) inklusive der hochgeladenen Dateien` : "Alle Dokumente und hochgeladenen Dateien (Lebenslauf, Anhänge)",
    "Dein Profil mit Profilbild, deine gespeicherten Suchen, Einstellungen und Bewerbungs-Checks",
    "Dein Dorf mit Inseln, Häusern, Punkten und Belohnungen",
    s ? `Freundschaften und Anfragen (${s.friends}) – deine Freunde sehen dich danach nicht mehr` : "Freundschaften und Anfragen – deine Freunde sehen dich danach nicht mehr",
    "Deine Anmeldung (E-Mail oder Google-Verknüpfung)",
  ];
  if (s && s.classes_joined > 0) items.push("Deine Klassenmitgliedschaften – Lehrpersonen sehen dich nicht mehr und deine Daten fliessen nicht mehr in deren Übersicht ein");
  return items;
}

export function teacherWarning(s: AccountSummary | null): string | null {
  if (!s || s.classes_owned < 1) return null;
  const classes = s.classes_owned === 1 ? "deine Klasse" : `deine ${s.classes_owned} Klassen`;
  const students = s.students_in_owned_classes;
  return `Du leitest ${classes}${students ? ` mit ${students} ${students === 1 ? "Schüler:in" : "Schüler:innen"}` : ""}. Hat eine Klasse eine Co-Lehrperson, geht sie an diese über. Sonst wird die Klasse gelöscht: Einladungscodes werden ungültig und die Schüler:innen werden aus der Klasse entfernt. Ihre eigenen Bewerbungen und Daten bleiben unverändert erhalten.`;
}

export const SUPPORT_EMAIL = "info.wendico@gmail.com";

/** Failure texts always tell the user where to turn if retrying does not help. */
export function withSupport(message: string): string {
  return `${message.trim()} Wenn es weiterhin nicht klappt, schreib uns an ${SUPPORT_EMAIL}.`;
}

export { MIN_PASSWORD_LENGTH };

/** German validation message for the "Passwort ändern" form, or null when the input is fine. */
export function passwordChangeProblem(current: string, next: string, repeat: string, email?: string | null): string | null {
  if (!current) return "Bitte gib dein aktuelles Passwort ein.";
  if (next.length < MIN_PASSWORD_LENGTH) return `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (next === current) return "Das neue Passwort muss sich vom aktuellen unterscheiden.";
  if (next !== repeat) return "Die beiden neuen Passwörter stimmen nicht überein.";
  return newPasswordProblem(next, email);
}
