// Plain-language labels for the /admin UI (no technical codes on screen). Pure: safe in client components and node tests.
import type { AccessReason, AccessState } from "../access/types.ts";
import { freeAccessActive } from "./free-access.ts";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "coral" | "brand";
export type UserStatusKey = "blocked" | "free_forever" | "free_until" | "paying" | "trial" | "expired" | "grace" | "licence_required" | "school" | "active" | "unknown";

export interface StatusRowLike {
  blocked?: boolean | null;
  free_access_forever?: boolean | null;
  free_access_until?: string | null;
  access_state?: AccessState | null;
  access_reason?: AccessReason | null;
  subscription?: { status: string } | null;
}

const PAYING = ["active", "trialing"];

/**
 * One status per person, most important first: Gesperrt > Gratis unbefristet > Gratis bis > Zahlend > Trial > Abgelaufen > …
 * `fmt` formats the end of a dated grant.
 */
export function userStatus(u: StatusRowLike, fmt: (iso: string) => string = (s) => s.slice(0, 10), now = Date.now()): { key: UserStatusKey; label: string; tone: StatusTone } {
  if (u.blocked || u.access_state === "blocked") return { key: "blocked", label: "Gesperrt", tone: "danger" };
  if (u.free_access_forever === true) return { key: "free_forever", label: "Gratis unbefristet", tone: "success" };
  if (freeAccessActive({ until: u.free_access_until }, now)) return { key: "free_until", label: `Gratis bis ${fmt(u.free_access_until!)}`, tone: "success" };
  if ((u.subscription && PAYING.includes(u.subscription.status)) || u.access_reason === "subscription" || u.access_reason === "family_subscription") {
    return { key: "paying", label: "Zahlend", tone: "brand" };
  }
  switch (u.access_state) {
    case "trial": return { key: "trial", label: "Trial", tone: "info" };
    case "expired": return { key: "expired", label: "Abgelaufen", tone: "coral" };
    case "grace": return { key: "grace", label: "Zahlung offen", tone: "warning" };
    case "licence_required": return { key: "licence_required", label: "Lizenz fehlt", tone: "warning" };
    case "active": return u.access_reason === "school_licence" ? { key: "school", label: "Über Schule", tone: "info" } : { key: "active", label: "Aktiv", tone: "success" };
    default: return { key: "unknown", label: "Unbekannt", tone: "neutral" };
  }
}

/** Why a person has access, in words. */
export const ACCESS_REASON_LABEL: Record<AccessReason, string> = {
  school_licence: "Lizenz der Schule",
  subscription: "Eigenes Abo",
  family_subscription: "Familien-Abo",
  grant: "Gratis-Zugang (vom Admin)",
  trial: "Trial",
  grace: "Zahlung offen, Zugang läuft noch",
  none: "Kein Zugang",
};

/** Stripe subscription status in words. */
export function subscriptionLabel(status: string): string {
  return ({
    active: "Aktiv", trialing: "Aktiv (Probezeit)", past_due: "Zahlung offen", unpaid: "Unbezahlt", paused: "Pausiert",
    incomplete: "Nicht abgeschlossen", incomplete_expired: "Abgebrochen", canceled: "Gekündigt",
  } as Record<string, string>)[status] ?? status;
}

const AUDIT: Record<string, string> = {
  "user.set_trial": "Trial-Ende gesetzt",
  "user.extend_trial": "Trial verlängert",
  "user.grant_access": "Gratis-Zugang gegeben",
  "user.revoke_access": "Gratis-Zugang entfernt",
  "user.block": "Konto gesperrt",
  "user.unblock": "Sperre aufgehoben",
  "user.soft_delete": "Zur Löschung vorgemerkt",
  "user.delete_account": "Konto gelöscht",
  "school.create": "Schule anlegen (gestartet)",
  "school.create.done": "Schule angelegt",
  "school.grant_access": "Schule gratis freigeschaltet",
  "school.revoke_access": "Gratis-Zugang der Schule entfernt",
  "school.assign_licence": "Lizenz zugewiesen",
  "school.update_licence": "Lizenz angepasst",
  "school.revoke_licence": "Lizenz widerrufen",
  "school.add_admin": "Schuladmin hinzugefügt",
  "school.remove_admin": "Schuladmin entfernt",
  "school.add_teacher": "Lehrperson hinzugefügt",
  "school.remove_teacher": "Lehrperson entfernt",
  family_grant: "Familienpaket vergeben",
  family_revoke: "Familienpaket entzogen",
};

/** Audit action code → words ("user.block.failed" → "Konto gesperrt – fehlgeschlagen"). Unknown codes stay as they are. */
export function auditActionLabel(action: string): string {
  const failed = action.endsWith(".failed");
  const base = failed ? action.slice(0, -".failed".length) : action;
  const label = AUDIT[base] ?? base;
  return failed ? `${label} – fehlgeschlagen` : label;
}
