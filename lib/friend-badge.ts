/** Pure helpers for the friend-request badge (no imports, so they are unit-testable). */
export type ConnectionLike = { state: "friend" | "incoming" | "outgoing" | string };

/** Only requests addressed TO the current user (state "incoming"); outgoing ones and friends never count. */
export function countIncoming(connections: ConnectionLike[]) { return connections.filter((c) => c.state === "incoming").length; }
/** "" for 0, the number up to 9, "9+" above. */
export function badgeText(count: number) { return count <= 0 ? "" : count > 9 ? "9+" : String(count); }
export function badgeLabel(count: number) { return count === 1 ? "1 offene Freundschaftsanfrage" : `${count} offene Freundschaftsanfragen`; }
/** Parses NEXT_PUBLIC_FRIEND_REQUESTS_MOCK: null when unset/invalid, else a non-negative integer. */
export function parseMock(value: string | undefined) { return value !== undefined && value.trim() !== "" && Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : null; }
