import type { ApplicationStatus, StatusCounts } from "../types/index.ts";

/** Pipeline order, left to right. New Lehrstellen steps sit between "Abgeschickt" and "Gespräch" (Schnupperlehre, Eignungstest) and after "Zusage" (Vertrag). */
export const STATUS_ORDER: ApplicationStatus[] = [
  "saved", "preparing", "applied", "schnupper_planned", "schnupper_done", "aptitude_test", "interview", "final_interview", "offer", "contract_signed", "rejected", "withdrawn",
];

export const statusLabels: Record<ApplicationStatus, string> = {
  saved: "Gemerkt",
  preparing: "In Vorbereitung",
  applied: "Abgeschickt",
  schnupper_planned: "Schnupperlehre geplant",
  schnupper_done: "Schnupperlehre gemacht",
  aptitude_test: "Eignungstest / Multicheck",
  interview: "Gespräch",
  final_interview: "Weiteres Gespräch",
  offer: "Zusage",
  contract_signed: "Vertrag unterschrieben",
  rejected: "Absage erhalten",
  withdrawn: "Zurückgezogen",
};

const set = (...list: ApplicationStatus[]) => new Set<ApplicationStatus>(list);

/** Finished, nothing left to do on this application. */
const CLOSED = set("rejected", "withdrawn", "contract_signed");
/** The decision is made: no application deadline matters any more ("Bewerben bis" is hidden). */
const DECIDED = set("offer", "contract_signed", "rejected", "withdrawn");
/** The application was sent. Schnupperlehre steps do NOT count: a trial day can happen before applying. */
const SENT = set("applied", "aptitude_test", "interview", "final_interview", "offer", "contract_signed", "rejected");
/** The company reacted in some way (invitation, test, answer). */
const REPLIED = set("schnupper_planned", "schnupper_done", "aptitude_test", "interview", "final_interview", "offer", "contract_signed", "rejected");
/** The student is invited / in contact with the company in person. */
const CONVERSATION = set("interview", "final_interview");
/** Statuses that carry the lookup of a trial day. */
const SCHNUPPER = set("schnupper_planned", "schnupper_done");
/** Student has a Lehrstelle: a Zusage or a signed contract. */
const PLACED = set("offer", "contract_signed");

export const isClosedStatus = (status: ApplicationStatus) => CLOSED.has(status);
export const isDecidedStatus = (status: ApplicationStatus) => DECIDED.has(status);
export const isSentStatus = (status: ApplicationStatus) => SENT.has(status);
export const isRepliedStatus = (status: ApplicationStatus) => REPLIED.has(status);
export const isConversationStatus = (status: ApplicationStatus) => CONVERSATION.has(status);
export const isSchnupperStatus = (status: ApplicationStatus) => SCHNUPPER.has(status);
export const isPlacedStatus = (status: ApplicationStatus) => PLACED.has(status);

/** Whether the "Bewerben bis" deadline is still meaningful (and should be shown / counted). */
export function showsDeadline(status: ApplicationStatus): boolean {
  return !DECIDED.has(status);
}

/** True for statuses a stored application can have (for parsing data from the server). */
export function isKnownStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (STATUS_ORDER as string[]).includes(value);
}

/** Extra class-view numbers derived from the shared status counts (no schema change needed, works for old rows). */
export function schnupperCounts(counts: StatusCounts | undefined) {
  const c = counts ?? {};
  const planned = c.schnupper_planned ?? 0;
  const done = c.schnupper_done ?? 0;
  return {
    schnupperPlanned: planned,
    schnupperDone: done,
    schnupper: planned + done,
    tests: c.aptitude_test ?? 0,
    contracts: c.contract_signed ?? 0,
    rejections: c.rejected ?? 0,
  };
}

/** A student counts as "placed" with a Zusage or a signed contract. `serverPlaced` is the flag already computed by the database. */
export function isPlacedFromCounts(counts: StatusCounts | undefined, serverPlaced = false): boolean {
  return serverPlaced || (counts?.offer ?? 0) > 0 || (counts?.contract_signed ?? 0) > 0;
}

export type SchnupperResult = "positive" | "neutral" | "negative";
export type TestResult = "pending" | "passed" | "failed";
export const schnupperResultLabels: Record<SchnupperResult, string> = { positive: "Hat gut gepasst", neutral: "Unentschieden", negative: "Eher nicht" };
export const testResultLabels: Record<TestResult, string> = { pending: "Noch offen", passed: "Bestanden", failed: "Nicht bestanden" };
export const parseSchnupperResult = (value: unknown): SchnupperResult | undefined => (value === "positive" || value === "neutral" || value === "negative" ? value : undefined);
export const parseTestResult = (value: unknown): TestResult | undefined => (value === "pending" || value === "passed" || value === "failed" ? value : undefined);

/** Short hint under the status picker, Lehrstellen wording. */
export const statusHints: Record<ApplicationStatus, string> = {
  saved: "Die Stelle ist dir aufgefallen, du hast noch nichts unternommen.",
  preparing: "Du arbeitest an Lebenslauf und Anschreiben.",
  applied: "Deine Unterlagen sind unterwegs.",
  schnupper_planned: "Du hast einen Schnuppertermin vereinbart. Trag unten das Datum ein.",
  schnupper_done: "Du warst schnuppern. Halte fest, wie es war.",
  aptitude_test: "Du schreibst einen Eignungstest oder Multicheck.",
  interview: "Du wurdest zu einem Gespräch eingeladen.",
  final_interview: "Es gibt eine weitere Runde oder ein Probearbeiten.",
  offer: "Du hast eine Zusage bekommen. Gratulation!",
  contract_signed: "Der Lehrvertrag ist unterschrieben. Du hast deine Lehrstelle!",
  rejected: "Diesmal hat es nicht geklappt – das gehört dazu.",
  withdrawn: "Du hast die Bewerbung selbst zurückgezogen.",
};
