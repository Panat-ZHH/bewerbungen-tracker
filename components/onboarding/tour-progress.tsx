import { clampStep, TOUR_STEPS, tourProgress } from "@/lib/onboarding-tour-core";

/** One counter for the whole tour: "Schritt 2 von 3" + step name + a flat sun-yellow bar ("Fertig" on the last screen). */
export function TourProgress({ step, replay }: { step: number; replay?: boolean }) {
  const p = tourProgress(step);
  const name = TOUR_STEPS[clampStep(step)];
  const done = p.label === "Fertig";
  return (
    <div className="mb-5" data-testid="tour-progress">
      <div className="flex items-baseline justify-between gap-3 text-small">
        <span className="font-semibold tabular">{p.label}</span>
        <span>{done ? (replay ? "Nochmals angesehen" : "") : replay ? `${name} · Nochmals ansehen` : name}</span>
      </div>
      <div role="progressbar" aria-label="Fortschritt der Einführung" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-valuetext={done ? "Fertig" : `${p.label}: ${name}`}
        className="mt-2 h-3 overflow-hidden rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)]">
        <div className="h-full rounded-full bg-[var(--sun)] motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${p.percent}%` }} />
      </div>
    </div>
  );
}
