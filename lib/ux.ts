// Pure UX helpers (no browser/Supabase imports so they can be unit-tested with node --test).

/**
 * Turns anything thrown by Supabase/fetch into a short, friendly German sentence.
 * Never returns raw technical text ("Database error: 42501 | ...") – that stays in the console.
 * `fallback` should say what failed, e.g. "Die Bewerbung konnte nicht gespeichert werden."
 */
export function friendlyMessage(reason: unknown, fallback: string): string {
  return generalCause(reason) ?? `${fallback} Versuch es bitte noch einmal.`;
}

/** Cause-specific message (offline, expired session, permissions, rate limit, server down) or null when the cause is unknown. */
export function generalCause(reason: unknown): string | null {
  const text = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : (reason as { message?: string } | null)?.message ?? "";
  const code = (reason as { code?: string } | null)?.code ?? "";
  const status = (reason as { status?: number } | null)?.status;
  const lower = text.toLowerCase();
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|offline/.test(lower) || (typeof navigator !== "undefined" && navigator.onLine === false)) return "Keine Verbindung zum Internet. Prüfe dein Netz und versuch es noch einmal.";
  if (status === 401 || /jwt|not signed in|must be signed in|auth session missing|refresh token/.test(lower)) return "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.";
  if (code === "42501" || /row-level security|permission denied/.test(lower)) return "Dafür fehlt dir die Berechtigung. Melde dich neu an und versuch es noch einmal.";
  if (code === "23505" || /duplicate key/.test(lower)) return "Das gibt es schon.";
  if (status === 429 || /rate limit|too many/.test(lower)) return "Zu viele Versuche. Warte einen Moment und versuch es dann noch einmal.";
  if (status !== undefined && status >= 500) return "Unser Server hat gerade ein Problem. Bitte versuch es gleich noch einmal.";
  return null;
}

/** Login / sign-up errors from Supabase Auth in friendly German. */
export function authMessage(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : (reason as { message?: string } | null)?.message ?? String(reason ?? "");
  const lower = text.toLowerCase();
  if (lower.includes("invalid login credentials")) return "E-Mail oder Passwort stimmt nicht. Versuch es noch einmal oder setze dein Passwort zurück.";
  if (lower.includes("email not confirmed")) return "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Link geschickt.";
  if (lower.includes("user already registered") || lower.includes("already been registered")) return "Für diese E-Mail gibt es schon ein Konto. Melde dich an.";
  if (lower.includes("password should be at least") || lower.includes("weak password")) return "Dein Passwort muss mindestens sechs Zeichen haben.";
  if (lower.includes("unable to validate email") || lower.includes("invalid email")) return "Diese E-Mail-Adresse sieht nicht richtig aus. Prüfe sie auf Tippfehler.";
  if (lower.includes("rate limit") || lower.includes("too many") || lower.includes("security purposes")) return "Zu viele Versuche. Warte kurz und versuch es dann noch einmal.";
  if (lower.includes("signups not allowed")) return "Neue Konten sind gerade nicht möglich.";
  if (/failed to fetch|networkerror|load failed|fetch failed/.test(lower)) return "Keine Verbindung zum Internet. Prüfe dein Netz und versuch es noch einmal.";
  return "Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es noch einmal.";
}

/** German message for an OAuth return (?error=… / ?error_description=… from Supabase or Google), or null if there is no error. */
export function oauthErrorMessage(params: URLSearchParams | string): string | null {
  const q = typeof params === "string" ? new URLSearchParams(params.replace(/^[?#]/, "")) : params;
  const error = q.get("error") ?? q.get("error_code");
  if (!error) return null;
  const text = `${error} ${q.get("error_code") ?? ""} ${q.get("error_description") ?? ""}`.toLowerCase();
  if (text.includes("access_denied") && !text.includes("signup")) return "Die Anmeldung mit Google wurde abgebrochen. Du kannst es jederzeit noch einmal versuchen.";
  if (text.includes("signup_disabled") || text.includes("signups not allowed")) return "Neue Konten sind gerade nicht möglich.";
  if (text.includes("identity_already_exists") || text.includes("already linked")) return "Dieses Google-Konto ist bereits mit einem anderen Konto verknüpft.";
  if (text.includes("email") && (text.includes("not confirmed") || text.includes("unverified"))) return "Deine Google-E-Mail-Adresse ist nicht bestätigt. Bestätige sie bei Google und versuch es noch einmal.";
  if (text.includes("provider_disabled") || text.includes("not enabled")) return "Die Anmeldung mit Google ist gerade nicht verfügbar. Melde dich mit E-Mail und Passwort an.";
  if (text.includes("bad_oauth") || text.includes("flow_state") || text.includes("code verifier") || text.includes("expired")) return "Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser gestartet. Bitte versuch es noch einmal.";
  return "Die Anmeldung mit Google hat nicht geklappt. Bitte versuch es noch einmal oder melde dich mit E-Mail und Passwort an.";
}

/** Rough password quality hint for sign-up (no blocking, just guidance). */
export function passwordHint(password: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!password) return { level: 0, label: "" };
  if (password.length < 6) return { level: 1, label: "Noch zu kurz – mindestens 6 Zeichen" };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 10 && variety >= 3) return { level: 3, label: "Stark" };
  if (password.length >= 8 && variety >= 2) return { level: 2, label: "Okay" };
  return { level: 1, label: "Einfach – länger oder mit Zahlen wird besser" };
}

export type DeadlineInfo = { days: number; label: string; tone: "danger" | "warning" | "neutral" };
/** Human wording for a deadline relative to today (dates as YYYY-MM-DD). */
export function deadlineInfo(deadline: string, today = new Date()): DeadlineInfo | null {
  const d = /^\d{4}-\d{2}-\d{2}/.test(deadline) ? new Date(`${deadline.slice(0, 10)}T00:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (days < 0) return { days, label: days === -1 ? "gestern abgelaufen" : `vor ${-days} Tagen abgelaufen`, tone: "danger" };
  if (days === 0) return { days, label: "heute", tone: "danger" };
  if (days === 1) return { days, label: "morgen", tone: "warning" };
  if (days <= 7) return { days, label: `in ${days} Tagen`, tone: "warning" };
  return { days, label: `in ${days} Tagen`, tone: "neutral" };
}

/** Is `value` a safe same-site path to return to after login? */
export function safeNextPath(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : null;
}
