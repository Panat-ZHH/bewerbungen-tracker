import { cn } from "@/lib/utils";
import { goalStatus, houseStage } from "./logic";
import type { ClassGoal } from "@/lib/b2b/client";

const STAGE_TEXT = ["Baustelle", "Fundament steht", "Mauern stehen", "Dach ist drauf", "Fertig gebaut"];

/**
 * "Klassendorf": every class goal is a house that the class builds together, in the style of the personal village map.
 * The house only grows with the shared progress of the whole class, never with one person's numbers.
 */
export function ClassVillage({ goals, className }: { goals: ClassGoal[]; className?: string }) {
  const shown = goals.map((g) => ({ g, st: goalStatus(g) })).filter((x) => x.st.kind === "progress").slice(0, 6);
  if (shown.length === 0) return null;
  return (
    <figure className={cn("panel-flat overflow-hidden p-0", className)}>
      <ul className="grid grid-cols-2 gap-x-2 bg-[var(--mint-soft)] px-3 pt-4 sm:grid-cols-3" aria-label="Klassendorf: jedes Ziel ist ein Haus">
        {shown.map(({ g, st }) => {
          const percent = st.kind === "progress" ? st.percent : 0;
          const stage = houseStage(st.kind === "progress" && st.done ? 100 : Math.min(99, percent));
          return (
            <li key={g.id} className="flex flex-col items-center pb-3 text-center">
              <House stage={stage} label={`${g.title}: ${STAGE_TEXT[stage]}, ${percent} Prozent`} />
              <span className="mt-1 line-clamp-2 text-xs font-bold leading-tight">{g.title}</span>
              <span className="text-[11px] text-muted">{STAGE_TEXT[stage]}</span>
            </li>
          );
        })}
      </ul>
      <figcaption className="text-small border-t-[length:var(--border-w)] border-[var(--outline)] px-4 py-2.5 text-muted">Klassendorf: Jedes Ziel ist ein Haus. Es wächst mit dem gemeinsamen Fortschritt der Klasse.</figcaption>
    </figure>
  );
}

function House({ stage, label }: { stage: number; label: string }) {
  const ink = "var(--outline-fill)";
  return (
    <svg viewBox="0 0 120 96" className="h-20 w-24" role="img" aria-label={label}>
      <ellipse cx="60" cy="88" rx="52" ry="7" fill="var(--mint)" stroke={ink} strokeWidth="2" />
      {stage === 0 && <g stroke={ink} strokeWidth="2" fill="var(--sun)"><path d="M30 86 l10 -18 l10 18 z" /><path d="M70 86 l8 -14 l8 14 z" fill="var(--coral)" /></g>}
      {stage >= 1 && <rect x="26" y="78" width="68" height="8" rx="2" fill="var(--surface-2)" stroke={ink} strokeWidth="2" />}
      {stage >= 2 && <rect x="32" y="48" width="56" height="30" fill="var(--surface)" stroke={ink} strokeWidth="2" />}
      {stage >= 2 && <rect x="54" y="60" width="12" height="18" rx="1" fill="var(--brand)" stroke={ink} strokeWidth="2" />}
      {stage >= 3 && <path d="M26 50 L60 22 L94 50 Z" fill="var(--coral)" stroke={ink} strokeWidth="2" strokeLinejoin="round" />}
      {stage >= 3 && <rect x="38" y="56" width="10" height="9" fill="var(--sun)" stroke={ink} strokeWidth="2" />}
      {stage >= 4 && <rect x="72" y="56" width="10" height="9" fill="var(--sun)" stroke={ink} strokeWidth="2" />}
      {stage >= 4 && <g stroke={ink} strokeWidth="2"><line x1="60" y1="22" x2="60" y2="6" /><path d="M60 6 L76 10 L60 14 Z" fill="var(--sun)" /></g>}
    </svg>
  );
}
