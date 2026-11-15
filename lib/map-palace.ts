// Palace (shop-v2): an application with an accepted status ("Zusage" = offer, contract_signed) is drawn as a palace
// instead of a house. Purely derived from the status: no DB column, it reverts as soon as the status changes back.
// The one-time celebration is remembered per application in localStorage (SSR-safe, private-mode-safe).
import type { Application, ApplicationStatus } from "../types/index.ts";

export const ACCEPTED_STATUSES: readonly ApplicationStatus[] = ["offer", "contract_signed"];

export const PALACE_SEEN_PREFIX = "wendapply:palace-seen:";

/** Celebration duration of the rising palace in the 3D map (ms). */
export const PALACE_RISE_MS = 1500;

export function isAcceptedStatus(status: ApplicationStatus | string | null | undefined): boolean {
  return status === "offer" || status === "contract_signed";
}

export function isPalace(application: Pick<Application, "status">): boolean {
  return isAcceptedStatus(application.status);
}

/** Applications whose house is currently a palace (input order kept). */
export function palaceApplications<T extends Pick<Application, "status">>(applications: readonly T[]): T[] {
  return applications.filter(isPalace);
}

export function hasPalace(applications: readonly Pick<Application, "status">[]): boolean {
  return applications.some(isPalace);
}

export function palaceSeenKey(applicationId: string): string {
  return PALACE_SEEN_PREFIX + applicationId;
}

/** Minimal Storage shape so tests can pass a fake; defaults to window.localStorage when available. */
export type PalaceStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): PalaceStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

/** True once the celebration for this application was shown. On the server (or without storage) everything counts as seen, so nothing celebrates. */
export function hasSeenPalace(applicationId: string, storage: PalaceStorage | null = defaultStorage()): boolean {
  if (!storage) return true;
  try { return storage.getItem(palaceSeenKey(applicationId)) === "1"; } catch { return true; }
}

export function markPalaceSeen(applicationId: string, storage: PalaceStorage | null = defaultStorage()): void {
  try { storage?.setItem(palaceSeenKey(applicationId), "1"); } catch { /* private mode: the celebration may simply show again */ }
}

/** Palaces whose celebration has not been shown yet (oldest application first, so it is deterministic). */
export function unseenPalaces<T extends Pick<Application, "status" | "id" | "createdAt">>(applications: readonly T[], storage: PalaceStorage | null = defaultStorage()): T[] {
  return palaceApplications(applications)
    .filter(({ id }) => !hasSeenPalace(id, storage))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Rise animation progress 0..1 (ease-out), 1 when finished or reduced motion is on. */
export function palaceRiseProgress(elapsedMs: number, reducedMotion = false): number {
  if (reducedMotion || elapsedMs >= PALACE_RISE_MS) return 1;
  const t = Math.max(0, elapsedMs) / PALACE_RISE_MS;
  return 1 - Math.pow(1 - t, 3);
}
