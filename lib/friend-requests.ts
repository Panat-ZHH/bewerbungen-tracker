import { listConnections } from "@/lib/social";
import { countIncoming, parseMock } from "@/lib/friend-badge";

export { badgeLabel, badgeText, countIncoming } from "@/lib/friend-badge";

/** NEXT_PUBLIC_FRIEND_REQUESTS_MOCK=<n> pretends n open requests exist (dev/tests with dummy env vars, no Supabase call). */
export const friendRequestsMock = parseMock(process.env.NEXT_PUBLIC_FRIEND_REQUESTS_MOCK);

/** Uses the existing social_list RPC (no new migration needed). */
export async function fetchIncomingCount(): Promise<number> { if (friendRequestsMock !== null) return friendRequestsMock; return countIncoming(await listConnections()); }
