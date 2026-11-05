import { socialErrorCode } from "@/lib/social";
import { generalCause } from "@/lib/ux";

export const PENDING_INVITE_KEY = "pendingInviteCode";

export function friendlyError(reason: unknown, fallback = "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.") {
  switch (socialErrorCode(reason)) {
    case "AUTH_REQUIRED": return "Bitte melde dich an, um fortzufahren.";
    case "USER_NOT_FOUND": return "Dazu haben wir niemanden gefunden. Prüfe den Code oder die E-Mail-Adresse.";
    case "CANNOT_ADD_SELF": return "Das ist dein eigener Code. Teile ihn lieber mit einer anderen Person.";
    case "ALREADY_FRIENDS": return "Ihr seid bereits befreundet.";
    case "REQUEST_PENDING": return "Es gibt schon eine offene Anfrage.";
    case "NOT_FOUND": return "Diese Anfrage gibt es nicht mehr.";
    case "INVALID_NAME": return "Dieser Name ist nicht gültig.";
    case "INVALID_AVATAR": return "Dieses Profilbild ist nicht gültig.";
    default: return generalCause(reason) ?? fallback;
  }
}

/** One label set for the whole app (lib/utils). */
export { statusLabels } from "@/lib/utils";

export type PendingInviteKind = "friend" | "class";
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Remembers an invite opened while logged out (localStorage survives e-mail confirmation in a new tab). */
export function storePendingInvite(code: string, kind: PendingInviteKind = "friend") {
  try { window.localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ kind, code, at: Date.now() })); } catch { /* storage unavailable */ }
}
export function readPendingInviteEntry(): { kind: PendingInviteKind; code: string } | null {
  try {
    const raw = window.localStorage.getItem(PENDING_INVITE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { kind?: string; code?: string; at?: number };
    if (!value.code || (value.kind !== "friend" && value.kind !== "class") || !value.at || Date.now() - value.at > PENDING_MAX_AGE_MS) { window.localStorage.removeItem(PENDING_INVITE_KEY); return null; }
    return { kind: value.kind, code: value.code };
  } catch { return null; }
}
/** Friend invite code waiting after login, if any. */
export function readPendingInvite(): string | null { const entry = readPendingInviteEntry(); return entry?.kind === "friend" ? entry.code : null; }
/** Path to open after login so the user lands back on the invite. Login/dashboard can call this. */
export function pendingInvitePath(): string | null {
  const entry = readPendingInviteEntry();
  if (!entry) return null;
  return entry.kind === "class" ? `/classes/join/${encodeURIComponent(entry.code)}` : `/invite/${encodeURIComponent(entry.code)}`;
}
export function clearPendingInvite() {
  try { window.localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* storage unavailable */ }
}
