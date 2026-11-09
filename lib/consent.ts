/**
 * Consent for sharing with a teacher (P0 item 7). Exactly three switches exist, in this order of dependence:
 *   share     = class_members.share_applications  "Fortschritt teilen" (master: counts, last activity, dates, deadlines)
 *   status    = class_members.share_status        "Status zeigen"
 *   companies = class_members.share_companies     "Firmen zeigen" (company, position, location)
 * Without "share" the teacher sees only the name (the other two flags are kept but have no effect, so turning "share" on again restores them). Every sentence of the consent text maps to one of these.
 *
 * Default: sharing is OFF. It is preselected ON only for students who said they are 16 or older
 * (the database trigger class_members_default_sharing enforces the same on insert).
 */
export type ConsentChoice = { share: boolean; status: boolean; companies: boolean };

export const CONSENT_LABELS = { share: "Fortschritt teilen", status: "Status zeigen", companies: "Firmen zeigen" } as const;

/** under16: true = under 16, false = 16 or older, null = unknown. Only a confirmed 16+ gets sharing preselected. */
export function defaultConsent(under16: boolean | null): ConsentChoice {
  const on = under16 === false;
  return { share: on, status: on, companies: on };
}
