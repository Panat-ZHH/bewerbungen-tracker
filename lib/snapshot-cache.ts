// Stale-while-revalidate snapshots of the logged-in home screens (reel fix 2, 2026-11-18).
// On a reload / new tab the page shows the user's last-known list at once and refreshes it from the server in the background.
// Pure module (no Supabase / React imports) so node --test can load it; the session check lives in lib/snapshot-client.ts.
//
// Security (shared school computers): one entry per user id and screen, only the fields the page lists (never notes, job texts,
// contacts, documents, tokens), read only for the user of the local session, max 7 days old, cleared on every sign-out and when
// another user appears in the tab. A snapshot is only ever a picture of what the server already showed this user: RLS stays the
// source of truth, and the workspace shell still gates role / access before anything is rendered.
import type { Application } from "../types/index.ts";

export const SNAPSHOT_PREFIX = "wa:snap:";
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Bigger entries are not stored at all (localStorage is ~5 MB per origin and shared with drafts etc.). */
export const SNAPSHOT_MAX_CHARS = 100_000;

/**
 * Data that may be cached: the user's own application list (shared by /dashboard and /applications). Never admin data,
 * family/parent views of a child, teacher class data, documents or job-search results.
 */
export type SnapshotName = "applications";
const NAMES: readonly SnapshotName[] = ["applications"];

type Entry = { v: number; userId: string; savedAt: number; data: unknown };
export type Snapshot<T> = { data: T; savedAt: number };
type Options = { storage?: Storage | null; now?: number };

/** window.localStorage, or null (SSR, private mode / blocked storage). */
export function snapshotStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
const pick = (options?: Options) => (options && "storage" in options ? options.storage ?? null : snapshotStorage());

// Supabase user ids are UUIDs; anything else (empty, ":" inside) would make the key ambiguous.
const validUser = (userId: unknown): userId is string => typeof userId === "string" && /^[0-9a-f-]{8,64}$/i.test(userId);

export function snapshotKey(userId: string, name: SnapshotName): string {
  return `${SNAPSHOT_PREFIX}v${SNAPSHOT_VERSION}:${userId}:${name}`;
}

function remove(storage: Storage, key: string) { try { storage.removeItem(key); } catch { /* blocked */ } }

/**
 * The stored snapshot of `name` for `userId`, or null when there is none, it belongs to someone else, is older than 7 days,
 * from another version or unreadable (bad entries are removed). `decode` validates / reshapes the stored data (null = reject).
 */
export function readSnapshot<T>(userId: string | null | undefined, name: SnapshotName, decode: (raw: unknown) => T | null, options?: Options): Snapshot<T> | null {
  const storage = pick(options);
  if (!storage || !validUser(userId) || !NAMES.includes(name)) return null;
  const key = snapshotKey(userId, name);
  let raw: string | null = null;
  try { raw = storage.getItem(key); } catch { return null; }
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Entry;
    const now = options?.now ?? Date.now();
    const fresh = entry && entry.v === SNAPSHOT_VERSION && entry.userId === userId && typeof entry.savedAt === "number"
      && entry.savedAt <= now + 60_000 && now - entry.savedAt <= SNAPSHOT_MAX_AGE_MS;
    const data = fresh ? decode(entry.data) : null;
    if (data === null || data === undefined) { remove(storage, key); return null; }
    return { data, savedAt: entry.savedAt };
  } catch {
    remove(storage, key);
    return null;
  }
}

/** Stores the snapshot (true = stored). Too big, quota full or storage blocked: nothing is stored and an old entry is dropped. */
export function writeSnapshot(userId: string | null | undefined, name: SnapshotName, data: unknown, options?: Options): boolean {
  const storage = pick(options);
  if (!storage || !validUser(userId) || !NAMES.includes(name)) return false;
  const key = snapshotKey(userId, name);
  try {
    const json = JSON.stringify({ v: SNAPSHOT_VERSION, userId, savedAt: options?.now ?? Date.now(), data } satisfies Entry);
    if (json.length > SNAPSHOT_MAX_CHARS) { remove(storage, key); return false; }
    storage.setItem(key, json);
    return true;
  } catch {
    remove(storage, key); // never leave an outdated picture behind after a failed update
    return false;
  }
}

function snapshotKeys(storage: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(SNAPSHOT_PREFIX)) keys.push(key); }
  } catch { /* blocked */ }
  return keys;
}

/** Removes every snapshot (all users, all versions). Called on every sign-out path. */
export function clearSnapshots(options?: Options): void {
  const storage = pick(options);
  if (!storage) return;
  for (const key of snapshotKeys(storage)) remove(storage, key);
}

/** Removes the snapshots of every other user (a different account appeared in this tab / on this device). */
export function clearSnapshotsExcept(userId: string, options?: Options): void {
  const storage = pick(options);
  if (!storage) return;
  const own = `${SNAPSHOT_PREFIX}v${SNAPSHOT_VERSION}:${userId}:`;
  for (const key of snapshotKeys(storage)) if (!validUser(userId) || !key.startsWith(own)) remove(storage, key);
}

// ---- Application lists: only what the dashboard / list show (no notes, job description, contacts, salary, links) ----
export type ApplicationSnapshot = Pick<Application, "id" | "company" | "position" | "location" | "category" | "status" | "deadline" | "appliedAt" | "createdAt" | "updatedAt">;
const MAX_ROWS = 300;

export function toApplicationSnapshot(applications: Application[]): ApplicationSnapshot[] {
  return applications.slice(0, MAX_ROWS).map(({ id, company, position, location, category, status, deadline, appliedAt, createdAt, updatedAt }) =>
    ({ id, company, position, location, category, status, deadline, appliedAt, createdAt, updatedAt }));
}

const str = (value: unknown) => typeof value === "string";
const optStr = (value: unknown) => value === undefined || value === null || typeof value === "string";

/** Validates a stored list; returns it as Application[] (the pages only read the snapshot fields) or null when malformed. */
export function decodeApplicationSnapshot(raw: unknown): Application[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ROWS) return null;
  const out: Application[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    if (!row || typeof row !== "object") return null;
    const { id, company, position, location, category, status, deadline, appliedAt, createdAt, updatedAt } = row;
    if (!str(id) || !str(company) || !str(position) || !str(category) || !str(status) || !str(createdAt) || !str(updatedAt)) return null;
    if (!optStr(location) || !optStr(deadline) || !optStr(appliedAt)) return null;
    out.push({ id, company, position, category, status, createdAt, updatedAt, location: location ?? undefined, deadline: deadline ?? undefined, appliedAt: appliedAt ?? undefined } as Application);
  }
  return out;
}

/** Codec for useSnapshotData (stable object, safe as an effect dependency). */
export const applicationsSnapshotCodec = { encode: toApplicationSnapshot, decode: decodeApplicationSnapshot } as const;
