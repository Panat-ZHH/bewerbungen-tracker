import { authMessage } from "./ux.ts";

type AuthLike = { message?: string; status?: number; code?: string; name?: string } | null | undefined;

/** Minutes to wait, parsed from Supabase texts such as "after 47 seconds" / "in 2 minutes"; falls back to a sensible default. */
export function retryMinutes(text: string, fallback = 60): number {
  const m = /(\d+)\s*(second|sec|minute|min|hour)/i.exec(text);
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith("sec")) return Math.max(1, Math.ceil(n / 60));
  if (unit.startsWith("hour")) return n * 60;
  return Math.max(1, n);
}

/**
 * Concrete German message for a Supabase Auth error (sign-up, login, reset, invite).
 * Handles HTTP 429 / over_*_rate_limit with a wait time; everything else goes through authMessage.
 */
export function authErrorMessage(reason: unknown): string {
  const e = (reason && typeof reason === "object" ? reason : null) as AuthLike;
  const text = (e?.message ?? (typeof reason === "string" ? reason : "")).toString();
  const lower = text.toLowerCase();
  const code = (e?.code ?? "").toLowerCase();
  if (e?.status === 429 || code.includes("rate_limit") || lower.includes("rate limit") || lower.includes("too many") || lower.includes("security purposes")) {
    const fallback = code === "over_email_send_rate_limit" || lower.includes("email rate limit") ? 60 : 1;
    const minutes = retryMinutes(text, fallback);
    return `Zu viele Versuche. Versuche es in ${minutes} ${minutes === 1 ? "Minute" : "Minuten"} noch einmal.`;
  }
  if (code === "email_address_invalid" || code === "validation_failed" || lower.includes("invalid email") || lower.includes("unable to validate email") || lower.includes("is invalid")) {
    return "Diese E-Mail-Adresse sieht nicht richtig aus. Prüfe sie auf Tippfehler.";
  }
  if (code === "user_already_exists" || code === "email_exists" || lower.includes("already registered") || lower.includes("already been registered")) {
    return "Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.";
  }
  if (code === "weak_password" || lower.includes("weak password") || lower.includes("password should")) {
    return "Dieses Passwort ist zu schwach. Nimm mindestens sechs Zeichen, am besten mit Zahlen und Buchstaben gemischt.";
  }
  if (code === "unexpected_failure" && lower.includes("sending")) return "Die E-Mail konnte nicht verschickt werden. Versuche es später noch einmal.";
  if (lower.includes("error sending") && lower.includes("email")) return "Die E-Mail konnte nicht verschickt werden. Versuche es später noch einmal.";
  return authMessage(reason);
}
