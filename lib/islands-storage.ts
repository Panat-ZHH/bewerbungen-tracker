import { supabase } from "@/lib/supabase";
import { clampUnlocked, type IslandsState } from "@/lib/islands";

function parse(data: unknown): IslandsState {
  const unlocked = data && typeof data === "object" && "unlocked" in data ? Number((data as { unlocked: unknown }).unlocked) : 1;
  return { unlocked: clampUnlocked(unlocked) };
}

function databaseError(error: { code?: string; message?: string }) {
  return Object.assign(new Error(`Database error: ${[error.code, error.message].filter(Boolean).join(" | ")}`), { code: error.code });
}

export async function getIslands(): Promise<IslandsState> {
  const { data, error } = await supabase.rpc("map_islands_state");
  if (error) throw databaseError(error);
  return parse(data);
}

export async function unlockIsland(islandNo: number): Promise<IslandsState> {
  const { data, error } = await supabase.rpc("map_island_unlock", { p_island_no: islandNo });
  if (error) throw databaseError(error);
  return parse(data);
}
