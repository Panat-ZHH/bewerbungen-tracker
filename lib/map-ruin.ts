// Burnt house: an application with status "rejected" (label «Absage erhalten») is drawn as a charred ruin with a
// small fire and rising smoke. Purely derived from the status (no DB column), so it reverts the moment the status changes.
//
// Precedence (documented decision): houses are per application, so one house can never be palace AND ruin at the same time
// (one status each). Wherever a single "look" is needed for a whole set of applications (e.g. a user/island summary),
// a palace always wins over a ruin: a Zusage is the outcome that matters, rejections are part of the way there.
// "withdrawn" (Zurückgezogen) is NOT a rejection and keeps the calm closed-house look.
import type { Application, ApplicationStatus } from "../types/index.ts";
import { isAcceptedStatus } from "./map-palace.ts";

export type HouseLook = "palace" | "ruin" | "house";

export function isRejectedStatus(status: ApplicationStatus | string | null | undefined): boolean {
  return status === "rejected";
}

/** Look of one application's house. Palace is checked first so a future status that counts as both stays a palace. */
export function houseLook(status: ApplicationStatus | string | null | undefined): HouseLook {
  if (isAcceptedStatus(status)) return "palace";
  if (isRejectedStatus(status)) return "ruin";
  return "house";
}

export function isRuin(application: Pick<Application, "status">): boolean {
  return houseLook(application.status) === "ruin";
}

export function ruinApplications<T extends Pick<Application, "status">>(applications: readonly T[]): T[] {
  return applications.filter(isRuin);
}

/** One look for a whole set of applications (user / island level): any palace wins, otherwise any ruin, otherwise a house. */
export function summaryLook(applications: readonly Pick<Application, "status">[]): HouseLook {
  const looks = applications.map(({ status }) => houseLook(status));
  if (looks.includes("palace")) return "palace";
  if (looks.includes("ruin")) return "ruin";
  return "house";
}

/** Flame flicker scale (≈0.75..1.25), deterministic per flame so tests and screenshots are stable. */
export function flameFlicker(seconds: number, seed: number): number {
  return 1 + Math.sin(seconds * 9.1 + seed * 1.7) * 0.12 + Math.sin(seconds * 13.7 + seed * 3.1) * 0.08 + Math.sin(seconds * 4.3 + seed) * 0.05;
}

/** Smoke puff phase 0..1 along its rise (loops). `offset` spreads puffs of one column. */
export function smokePhase(seconds: number, offset: number, periodSeconds = 4.5): number {
  const phase = (seconds / periodSeconds + offset) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Puff size over its life: grows, then thins out at the top so it never pops. */
export function smokeScale(phase: number): number {
  const grow = 0.45 + phase * 0.9;
  const fade = phase > 0.75 ? 1 - (phase - 0.75) / 0.25 : 1;
  return Math.max(0, grow * fade);
}
