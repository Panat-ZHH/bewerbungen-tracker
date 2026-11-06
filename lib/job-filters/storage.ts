// Recent searches and saved presets in localStorage. SSR-safe; every function accepts an injected Storage for tests.
import type { JobPreset, JobSearchState } from "./types.ts";
import { paramsToState, stateToParams } from "./url.ts";

export const RECENT_KEY = "wendapply.jobsearch.recent";
export const PRESETS_KEY = "wendapply.jobsearch.presets";
export const MAX_RECENT = 8;
export const MAX_PRESETS = 20;
export interface RecentSearch { state: JobSearchState; at: string }

type StorageLike = Pick<Storage, "getItem" | "setItem">;
function getStorage(storage?: StorageLike): StorageLike | undefined {
  if (storage) return storage;
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}
/** Stable identity of a search (query + filters + sort), used to dedupe. */
export const searchKey = (state: JobSearchState) => stateToParams({ ...state, query: state.query.trim().toLowerCase() }).toString();
// States are persisted as URL-param strings, which reuses the validation of url.ts.
const encode = (state: JobSearchState) => stateToParams(state).toString();
const decode = (value: unknown): JobSearchState | undefined => (typeof value === "string" ? paramsToState(value) : undefined);

function read<T>(key: string, storage: StorageLike | undefined, map: (raw: unknown) => T | undefined): T[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(map).filter((x): x is T => x !== undefined) : [];
  } catch { return []; }
}
function write(key: string, value: unknown, storage?: StorageLike) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode */ }
}

export function loadRecent(storage?: StorageLike): RecentSearch[] {
  return read(RECENT_KEY, getStorage(storage), (raw) => {
    const r = raw as { s?: unknown; at?: unknown };
    const state = decode(r?.s);
    return state ? { state, at: typeof r.at === "string" ? r.at : new Date(0).toISOString() } : undefined;
  }).slice(0, MAX_RECENT);
}

/** Pure: put a search at the front, dedupe, cap at 8. Searches without query and filters are not remembered. */
export function addRecentTo(list: RecentSearch[], state: JobSearchState, at = new Date().toISOString()): RecentSearch[] {
  if (!state.query.trim()) return list;
  const key = searchKey(state);
  return [{ state, at }, ...list.filter((entry) => searchKey(entry.state) !== key)].slice(0, MAX_RECENT);
}

export function addRecent(state: JobSearchState, storage?: StorageLike, at?: string): RecentSearch[] {
  const s = getStorage(storage);
  const next = addRecentTo(loadRecent(s), state, at);
  write(RECENT_KEY, next.map((e) => ({ s: encode(e.state), at: e.at })), s);
  return next;
}
export function removeRecent(state: JobSearchState, storage?: StorageLike): RecentSearch[] {
  const s = getStorage(storage);
  const key = searchKey(state);
  const next = loadRecent(s).filter((e) => searchKey(e.state) !== key);
  write(RECENT_KEY, next.map((e) => ({ s: encode(e.state), at: e.at })), s);
  return next;
}
export function clearRecent(storage?: StorageLike) { write(RECENT_KEY, [], getStorage(storage)); }

export function loadPresets(storage?: StorageLike): JobPreset[] {
  return read(PRESETS_KEY, getStorage(storage), (raw) => {
    const r = raw as { id?: unknown; name?: unknown; s?: unknown; createdAt?: unknown };
    const state = decode(r?.s);
    if (!state || typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim()) return undefined;
    return { id: r.id, name: r.name, state, createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString() };
  });
}
function savePresets(list: JobPreset[], storage?: StorageLike) {
  write(PRESETS_KEY, list.map((p) => ({ id: p.id, name: p.name, s: encode(p.state), createdAt: p.createdAt })), getStorage(storage));
}
/** Saves a preset (a preset with the same name is replaced). Returns the new list, newest first. */
export function savePreset(name: string, state: JobSearchState, storage?: StorageLike, now = new Date()): JobPreset[] {
  const clean = name.trim().slice(0, 60);
  if (!clean) return loadPresets(storage);
  const others = loadPresets(storage).filter((p) => p.name.toLowerCase() !== clean.toLowerCase());
  const preset: JobPreset = { id: `p${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean, state, createdAt: now.toISOString() };
  const next = [preset, ...others].slice(0, MAX_PRESETS);
  savePresets(next, storage);
  return next;
}
export function deletePreset(id: string, storage?: StorageLike): JobPreset[] {
  const next = loadPresets(storage).filter((p) => p.id !== id);
  savePresets(next, storage);
  return next;
}
export function renamePreset(id: string, name: string, storage?: StorageLike): JobPreset[] {
  const clean = name.trim().slice(0, 60);
  const next = loadPresets(storage).map((p) => (p.id === id && clean ? { ...p, name: clean } : p));
  savePresets(next, storage);
  return next;
}
