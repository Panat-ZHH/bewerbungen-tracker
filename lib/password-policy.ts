// One password policy for signup, reset and "Passwort ändern" (pure, unit tested in tests/auth-hardening.test.mjs).
// Supabase Auth enforces its own minimum server-side (project setting password_min_length); keep that at >= this value.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt (Supabase Auth) ignores everything after 72 bytes

/** Very common passwords (and their obvious German variants) that are refused even when long enough. */
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
  "password", "password1", "password123", "passwort", "passwort1", "passwort123", "qwertz123", "qwertzui", "qwertyui",
  "qwerty123", "asdfghjk", "iloveyou", "abcd1234", "abc12345", "letmein1", "welcome1", "willkommen", "hallo123",
  "schule123", "wendapply", "bewerbung", "lehrstelle", "admin123", "fussball", "sommer2026", "winter2026",
]);

/** German problem text for a new password, or null when it is fine. */
export function newPasswordProblem(password: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Dein Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) return `Dein Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "Dieses Passwort ist zu einfach zu erraten. Nimm ein anderes.";
  const local = (email ?? "").trim().toLowerCase().split("@")[0];
  if (email && (lower === email.trim().toLowerCase() || (local.length >= 4 && lower === local))) return "Dein Passwort darf nicht deine E-Mail-Adresse sein.";
  return null;
}

/**
 * supabase.auth.updateUser() attributes for "Passwort ändern". `current_password` lets Supabase Auth check the old
 * password ON THE SERVER once the project setting security_update_password_require_current_password is on (it is
 * ignored while the setting is off). Without it, anyone holding a session (a school PC left signed in) can set a new
 * password and lock the owner out. Reset links (recovery sessions) are exempt on the server: /login/reset sends only
 * the new password.
 */
export function passwordChangeAttributes(current: string, next: string): { password: string; current_password: string } {
  return { password: next, current_password: current };
}

/** true for Supabase Auth's "current password missing / wrong" answers (error codes current_password_*). */
export function isCurrentPasswordError(error: unknown): boolean {
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "current_password_required" || code === "current_password_mismatch";
}
