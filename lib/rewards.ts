// Instant micro-rewards (toast + stamp/confetti from lib/joy.ts) and the weekly goal. Everything is stored locally (localStorage),
// no database table. Pure helpers live in rewards-core.ts (unit-tested in tests/rewards.test.mjs).
import { toast } from "@/lib/toast";
import { confetti, stamp } from "@/lib/joy";
import { bumpProgress, messages, PROGRESS_KEY, readProgress, storage, type RewardKind } from "@/lib/rewards-core";
export * from "@/lib/rewards-core";

const listeners = new Set<() => void>();
export function subscribeProgress(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export { confetti };

/** Call right after a successful save/status change. Toast always, "ABGESCHICKT!" stamp for a sent application, confetti for a follow-up, progress counted. */
export function reward(kind: RewardKind) {
  const list = messages[kind];
  toast({ message: list[Math.floor(Math.random() * list.length)], tone: "success", duration: 3500 });
  if (kind === "applied") stamp("Abgeschickt!", "blue");
  else if (kind === "followup") confetti(14);
  try { storage()?.setItem(PROGRESS_KEY, JSON.stringify(bumpProgress(readProgress(), kind))); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}
