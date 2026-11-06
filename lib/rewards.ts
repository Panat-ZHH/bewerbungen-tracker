// Instant micro-rewards (toast + small confetti) and the weekly goal. Everything is stored locally (localStorage),
// no database table. Pure helpers live in rewards-core.ts (unit-tested in tests/rewards.test.mjs).
import { toast } from "@/lib/toast";
import { bumpProgress, messages, PROGRESS_KEY, readProgress, storage, type RewardKind } from "@/lib/rewards-core";
export * from "@/lib/rewards-core";

const listeners = new Set<() => void>();
export function subscribeProgress(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Small confetti burst; skipped entirely for prefers-reduced-motion. Pure DOM, removes itself. */
export function confetti() {
  if (typeof document === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "confetti-host";
  const colors = ["#0a84ff", "#34c759", "#ff9f0a", "#bf5af2", "#ff453a"];
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 220)}px`);
    piece.style.setProperty("--dy", `${-Math.round(80 + Math.random() * 120)}px`);
    piece.style.setProperty("--rot", `${Math.round(Math.random() * 540 - 270)}deg`);
    piece.style.background = colors[i % colors.length];
    host.appendChild(piece);
  }
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 1400);
}

/** Call right after a successful save/status change. Toast always, confetti for bigger steps, progress counted. */
export function reward(kind: RewardKind) {
  const list = messages[kind];
  toast({ message: list[Math.floor(Math.random() * list.length)], tone: "success", duration: 3500 });
  if (kind !== "saved") confetti();
  try { storage()?.setItem(PROGRESS_KEY, JSON.stringify(bumpProgress(readProgress(), kind))); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}
