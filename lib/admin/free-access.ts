// Free access ("Gratis-Zugang") helpers shared by the /admin UI and tests. Pure: no I/O, safe in client components.

export interface FreeAccessLike { forever?: boolean | null; until?: string | null }

/** Active now: unlimited, or "until" lies in the future. */
export function freeAccessActive(g: FreeAccessLike | null | undefined, now = Date.now()): boolean {
  if (!g) return false;
  if (g.forever === true) return true;
  const t = g.until ? Date.parse(g.until) : NaN;
  return Number.isFinite(t) && t > now;
}

/** "Gratis (unbefristet)" / "Gratis bis 31.12.2027" for an ACTIVE grant, else null. */
export function freeAccessLabel(g: FreeAccessLike | null | undefined, formatDate: (iso: string) => string, now = Date.now()): string | null {
  if (!freeAccessActive(g, now)) return null;
  return g!.forever ? "Gratis (unbefristet)" : `Gratis bis ${formatDate(g!.until!)}`;
}

/** Form state of the "Gratis-Zugang" dialog → API body (person and school use the same shape). */
export interface FreeAccessForm { kind: "forever" | "until"; until: string; note: string }
export function freeAccessBody(f: FreeAccessForm): Record<string, unknown> {
  const body: Record<string, unknown> = f.kind === "forever" ? { forever: true } : { until: f.until };
  if (f.note.trim()) body.note = f.note.trim();
  return body;
}
