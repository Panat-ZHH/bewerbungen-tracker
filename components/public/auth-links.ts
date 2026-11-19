/**
 * The two entry points of the public site (SPEC-FLOW §5): «Kostenlos testen» (primary) opens the sign-up funnel,
 * «Anmelden» (secondary/quiet) opens the plain login. Never one combined button.
 */
export const SIGNUP_HREF = "/start";
export const LOGIN_HREF = "/login";
export const SIGNUP_LABEL = "Kostenlos testen";
export const LOGIN_LABEL = "Anmelden";

/** Adds a safe in-app `next` target (already a same-origin path like "/abo") to the signup or login link. */
export function withNext(href: string, next: string): string {
  return `${href}?next=${encodeURIComponent(next)}`;
}
