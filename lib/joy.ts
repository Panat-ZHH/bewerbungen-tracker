// Joy moments: stamp, confetti and the sentence that goes with a status change.
// Pure DOM + CSS (classes in app/globals.css), no dependency. Everything is skipped for prefers-reduced-motion
// (the toast with the sentence still appears). Animations are short (<= 600ms in, then gone).
import { toast } from "@/lib/toast";
import type { ApplicationStatus } from "@/types";

const reducedMotion = () => typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Token colours only: logo blue, yellow, coral, green, ink.
const CONFETTI = ["var(--brand)", "var(--sun)", "var(--coral)", "var(--mint)", "var(--ink)"];

/** Small confetti burst from the bottom centre. Removes itself. */
export function confetti(pieces = 22) {
  if (typeof document === "undefined" || reducedMotion()) return;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "confetti-host";
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 300)}px`);
    piece.style.setProperty("--dy", `${-Math.round(140 + Math.random() * 200)}px`);
    piece.style.setProperty("--rot", `${Math.round(Math.random() * 540 - 270)}deg`);
    piece.style.animationDelay = `${Math.round(Math.random() * 80)}ms`;
    piece.style.background = CONFETTI[i % CONFETTI.length];
    host.appendChild(piece);
  }
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 900);
}

export type StampTone = "blue" | "coral" | "mint";
const STAMP_INK: Record<StampTone, string> = { blue: "var(--brand)", coral: "var(--coral-fg)", mint: "var(--success-fg)" };

/** Rubber-stamp effect in the middle of the screen ("ABGESCHICKT!"): slams in, rests, fades. */
export function stamp(text: string, tone: StampTone = "blue") {
  if (typeof document === "undefined" || reducedMotion()) return;
  document.querySelectorAll(".stamp-host").forEach((node) => node.remove());
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "stamp-host";
  const mark = document.createElement("span");
  mark.className = "stamp";
  mark.style.setProperty("--stamp-ink", STAMP_INK[tone]);
  mark.style.setProperty("--stamp-bg", "var(--surface)");
  mark.textContent = text;
  host.appendChild(mark);
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 1450);
}

export type Moment = { kind: "stamp" | "party" | "comfort"; message: string; stampText?: string; stampTone?: StampTone };

/** What to show when an application moves to `status` (null = nothing special). Texts: warm, "du", Swiss spelling. */
export function momentFor(status: ApplicationStatus): Moment | null {
  switch (status) {
    case "applied": return { kind: "stamp", message: "Abgeschickt – stark, das war der schwierigste Schritt!", stampText: "Abgeschickt!", stampTone: "blue" };
    case "interview": return { kind: "party", message: "Ein Gespräch! Du hast überzeugt – jetzt zeigst du, wer du bist." };
    case "final_interview": return { kind: "party", message: "Noch eine Runde – die wollen dich wirklich kennenlernen!" };
    case "offer": return { kind: "party", message: "ZUSAGE! Das hast du dir verdient. Wir feiern mit dir!", stampText: "Zusage!", stampTone: "coral" };
    case "contract_signed": return { kind: "party", message: "Unterschrieben! Du hast deine Lehrstelle. Riesig!", stampText: "Geschafft!", stampTone: "mint" };
    case "rejected": return { kind: "comfort", message: "Gehört dazu. Weiter geht’s 💪" };
    default: return null;
  }
}

/** Search link for "ähnliche Stellen" after a rejection (existing URL params of /search, no search logic involved). */
export function similarJobsHref(position?: string | null, location?: string | null) {
  const params = new URLSearchParams();
  if (position?.trim()) params.set("q", position.trim());
  if (location?.trim()) params.set("l", location.trim());
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

/**
 * Call right after a status change was saved. Shows the matching moment:
 * Gespräch/Zusage = confetti + motivating sentence, Absage = calm encouragement + "Ähnliche Stellen" action.
 * `applied` is NOT handled here: lib/rewards.ts `reward("applied")` already does stamp + toast + weekly goal.
 */
export function celebrateStatus(status: ApplicationStatus, previous?: ApplicationStatus | null, context?: { position?: string | null; location?: string | null }) {
  if (status === previous || status === "applied") return;
  const moment = momentFor(status);
  if (!moment) return;
  if (moment.kind === "comfort") {
    const href = similarJobsHref(context?.position, context?.location);
    toast({ message: moment.message, tone: "info", duration: 9000, action: { label: "Ähnliche Stellen", onClick: () => { window.location.assign(href); } } });
    return;
  }
  toast({ message: moment.message, tone: "success", duration: 5000 });
  confetti(moment.stampText ? 34 : 24);
  if (moment.stampText) stamp(moment.stampText, moment.stampTone);
}
