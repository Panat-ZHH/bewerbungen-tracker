/**
 * What the "Passwort zurücksetzen" e-mail link brought to /login/reset.
 *
 * - "token_hash": new link format (`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`). Works on any
 *   device/browser, and the token is only used when the user submits the form (mail scanners that open links don't burn it).
 * - "code": old PKCE link (`?code=`). Only works in the browser that requested the reset (the code verifier lives there).
 * - "error": Supabase redirected back with an error, e.g. `#error_code=otp_expired` (link already used or too old).
 * - "none": opened without anything (bookmark, reload after success).
 */
export type RecoveryLink =
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "code" }
  | { kind: "error"; code: string; description: string }
  | { kind: "none" };

export function parseRecoveryLink(search: string, hash: string): RecoveryLink {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const errorCode = query.get("error_code") ?? fragment.get("error_code") ?? query.get("error") ?? fragment.get("error");
  if (errorCode) {
    return { kind: "error", code: errorCode, description: query.get("error_description") ?? fragment.get("error_description") ?? "" };
  }
  const tokenHash = query.get("token_hash");
  const type = query.get("type");
  if (tokenHash && (!type || type === "recovery")) return { kind: "token_hash", tokenHash };
  if (query.get("code")) return { kind: "code" };
  return { kind: "none" };
}
