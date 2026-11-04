import { socialErrorCode } from "@/lib/social";
import type { ApplicationStatus } from "@/types";

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
    default: return fallback;
  }
}

export const statusLabels: Record<ApplicationStatus, string> = {
  saved: "Gemerkt",
  preparing: "In Vorbereitung",
  applied: "Beworben",
  interview: "Gespräch",
  final_interview: "Finalrunde",
  offer: "Zusage",
  rejected: "Absage",
  withdrawn: "Zurückgezogen",
};

export function readPendingInvite(): string | null {
  try { return window.sessionStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
}
export function storePendingInvite(code: string) {
  try { window.sessionStorage.setItem(PENDING_INVITE_KEY, code); } catch { /* storage unavailable */ }
}
export function clearPendingInvite() {
  try { window.sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* storage unavailable */ }
}
