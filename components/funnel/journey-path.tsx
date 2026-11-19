import { useId } from "react";
import { cn } from "@/lib/utils";
import styles from "./funnel.module.css";

/** The six milestones of the journey (also the visually hidden list for screen readers). */
export const JOURNEY_MILESTONES = ["Berufe entdecken", "Schnuppern", "Bewerben", "Gespräch", "Zusage", "Vertrag unterschrieben"] as const;

const ROAD = "M80 402 C 160 400, 250 380, 250 345 C 250 300, 100 310, 100 275 C 100 235, 260 245, 260 210 C 260 170, 110 175, 110 140 C 110 100, 240 105, 240 70";

/**
 * Screen 0 «Dein Weg»: the way from the first job idea to the signed contract, drawn like the WendApply village (isometric
 * houses with ink contour, cobblestone road, label chips with a hard shadow). Inline SVG, no image request, no WebGL.
 * Ported from _onboarding/wireframes/journey.html (SPEC-FLOW §3.3). The draw-in animation runs once (≤ 1.2 s) and only with
 * prefers-reduced-motion: no-preference; `animate={false}` renders the final state (returning to the screen via «Zurück»).
 */
export function JourneyPath({ animate = true, className }: { animate?: boolean; className?: string }) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `jp-${raw}-${name}`;
  const house = `#${id("house")}`;
  const tree = `#${id("tree")}`;
  return (
    <figure className={cn("m-0", className)} data-testid="journey-path">
      <svg viewBox="0 -28 360 468" role="img" aria-labelledby={id("title")} className={cn(styles.journey, animate && styles.animate)}>
        <title id={id("title")}>{`Weg mit sechs Etappen: ${JOURNEY_MILESTONES.join(", ")}`}</title>
        <defs>
          {/* isometric house: origin = front corner on the ground. --roof = status colour of the milestone */}
          <g id={id("house")}>
            <polygon points="0,6 36,-12 0,-30 -36,-12" fill="var(--v-grass-2)" />
            <polygon points="0,0 -22,-11 -22,-31 0,-20" fill="var(--v-wall)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
            <polygon points="0,0 22,-11 22,-31 0,-20" fill="var(--v-wall-shade)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
            <polygon points="-25,-31 0,-18 0,-56" fill="var(--roof)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
            <polygon points="0,-18 25,-31 0,-56" fill="var(--roof)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" style={{ filter: "brightness(.86)" }} />
            <polygon points="-14,-9 -8,-6 -8,-16 -14,-19" fill="var(--outline)" opacity=".75" />
          </g>
          <g id={id("tree")}>
            <rect x="-2" y="-8" width="4" height="8" fill="var(--v-trunk)" />
            <polygon points="0,-30 9,-8 -9,-8" fill="var(--v-tree)" />
            <polygon points="0,-30 9,-8 0,-8" fill="var(--v-tree-dark)" />
          </g>
        </defs>

        <path d="M30 230 C 10 120, 120 20, 230 30 C 330 40, 360 140, 340 250 C 320 360, 250 430, 150 425 C 60 420, 40 330, 30 230 Z" fill="var(--v-grass)" />
        <path d={ROAD} fill="none" stroke="var(--v-road-edge)" strokeWidth="20" strokeLinecap="round" />
        <path className={styles.road} d={ROAD} fill="none" stroke="var(--v-road)" strokeWidth="15" strokeLinecap="round" />

        <use href={tree} x="300" y="300" /><use href={tree} x="45" y="200" /><use href={tree} x="315" y="150" /><use href={tree} x="160" y="430" transform="scale(.8)" />

        {/* 1 Berufe entdecken: signpost */}
        <g transform="translate(80 402)"><g className={styles.stop} style={{ ["--i" as string]: 0 }}>
          <polygon points="0,6 30,-9 0,-24 -30,-9" fill="var(--v-grass-2)" />
          <rect x="-2" y="-46" width="4" height="44" fill="var(--v-trunk)" stroke="var(--outline)" strokeWidth="1.2" />
          <polygon points="-2,-44 22,-44 28,-38 22,-32 -2,-32" fill="var(--v-sand)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
          <polygon points="2,-28 -22,-28 -28,-22 -22,-16 2,-16" fill="var(--sun)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
        </g></g>
        {/* 2 Schnuppern: small workshop, blue roof */}
        <g transform="translate(250 345) scale(.8)"><g className={styles.stop} style={{ ["--i" as string]: 1, ["--roof" as string]: "var(--v-roof-blue)" }}><use href={house} /></g></g>
        {/* 3 Bewerben: house + letter */}
        <g transform="translate(100 275) scale(.9)"><g className={styles.stop} style={{ ["--i" as string]: 2, ["--roof" as string]: "var(--v-roof-blue)" }}>
          <use href={house} />
          <g transform="translate(14 -66)"><rect x="-10" y="-7" width="20" height="14" rx="2" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.4" /><path d="M-10 -7 L0 1 L10 -7" fill="none" stroke="var(--outline)" strokeWidth="1.4" /></g>
        </g></g>
        {/* 4 Gespräch: coral roof + speech bubble */}
        <g transform="translate(260 210)"><g className={styles.stop} style={{ ["--i" as string]: 3, ["--roof" as string]: "var(--coral)" }}>
          <use href={house} />
          <g transform="translate(-12 -70)"><path d="M-12 -9 h24 a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 h-14 l-6 5 v-5 h-4 a4 4 0 0 1 -4 -4 v-8 a4 4 0 0 1 4 -4z" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.4" /></g>
        </g></g>
        {/* 5 Zusage: mint roof + flag */}
        <g transform="translate(110 140) scale(1.05)"><g className={styles.stop} style={{ ["--i" as string]: 4, ["--roof" as string]: "var(--mint)" }}>
          <use href={house} />
          <g transform="translate(0 -56)"><rect x="-1" y="-20" width="2" height="20" fill="var(--outline)" /><polygon points="1,-20 15,-15 1,-10" fill="var(--mint)" stroke="var(--outline)" strokeWidth="1.2" strokeLinejoin="round" /></g>
        </g></g>
        {/* 6 Vertrag unterschrieben: biggest house + contract sheet */}
        <g transform="translate(240 70) scale(1.2)"><g className={styles.stop} style={{ ["--i" as string]: 5, ["--roof" as string]: "var(--mint)" }}>
          <use href={house} />
          <g transform="translate(18 -58) rotate(8)"><rect x="-8" y="-10" width="16" height="20" rx="1.5" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.3" /><path d="M-4 -4 h8 M-4 0 h8 M-4 5 q2 -3 4 0 t4 0" fill="none" stroke="var(--outline)" strokeWidth="1.1" /></g>
        </g></g>
        <g transform="translate(292 22)"><g className={styles.spark}><path d="M0 -9 L2 -2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2 -2 Z" fill="var(--sun)" stroke="var(--outline)" strokeWidth="1.2" strokeLinejoin="round" /></g></g>

        <Label i={0} x={118} y={392} w={132} text="Berufe entdecken" />
        <Label i={1} x={118} y={336} w={96} text="Schnuppern" />
        <Label i={2} x={140} y={262} w={82} text="Bewerben" />
        <Label i={3} x={140} y={200} w={80} text="Gespräch" />
        <Label i={4} x={150} y={128} w={70} text="Zusage" />
        <g className={styles.label} style={{ ["--i" as string]: 5 }} transform="translate(70 6)">
          <rect className={styles.shadow} x="2" y="2" width="132" height="36" rx="8" /><rect className={styles.chip} x="0" y="0" width="132" height="36" rx="8" />
          <text className={styles.t} x="10" y="15">Vertrag</text><text className={styles.s} x="10" y="29">unterschrieben</text>
        </g>

        <g transform="translate(40 352)"><g className={styles.pin}>
          <rect className={styles.shadow} x="2" y="2" width="76" height="22" rx="11" />
          <rect x="0" y="0" width="76" height="22" rx="11" fill="var(--sun)" stroke="var(--outline)" strokeWidth="1.6" />
          <text className={styles.you} x="38" y="15" textAnchor="middle">Du bist hier</text>
          <path d="M34 22 L38 30 L42 22" fill="var(--sun)" stroke="var(--outline)" strokeWidth="1.6" strokeLinejoin="round" />
        </g></g>
      </svg>
      <ol className="sr-only">{JOURNEY_MILESTONES.map((m) => <li key={m}>{m}</li>)}</ol>
    </figure>
  );
}

function Label({ i, x, y, w, text }: { i: number; x: number; y: number; w: number; text: string }) {
  return (
    <g className={styles.label} style={{ ["--i" as string]: i }} transform={`translate(${x} ${y})`}>
      <rect className={styles.shadow} x="2" y="2" width={w} height="22" rx="7" />
      <rect className={styles.chip} x="0" y="0" width={w} height="22" rx="7" />
      <text className={styles.t} x="10" y="15">{text}</text>
    </g>
  );
}

/** One small decorative tile of the journey (confirmation page, desktop question screens): the house of a milestone. */
export function JourneyTile({ milestone, className }: { milestone: "bewerben" | "zusage" | "vertrag"; className?: string }) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const roof = milestone === "bewerben" ? "var(--brand)" : "var(--mint)";
  return (
    <svg viewBox="-45 -80 90 90" aria-hidden className={cn(styles.journey, className)} focusable="false">
      <defs><clipPath id={`jt-${raw}`}><rect x="-45" y="-80" width="90" height="90" /></clipPath></defs>
      <g clipPath={`url(#jt-${raw})`} style={{ ["--roof" as string]: roof }}>
        <polygon points="0,6 36,-12 0,-30 -36,-12" fill="var(--v-grass-2)" />
        <polygon points="0,0 -22,-11 -22,-31 0,-20" fill="var(--v-wall)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
        <polygon points="0,0 22,-11 22,-31 0,-20" fill="var(--v-wall-shade)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
        <polygon points="-25,-31 0,-18 0,-56" fill="var(--roof)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" />
        <polygon points="0,-18 25,-31 0,-56" fill="var(--roof)" stroke="var(--outline)" strokeWidth="1.4" strokeLinejoin="round" style={{ filter: "brightness(.86)" }} />
        {milestone === "bewerben" && <g transform="translate(14 -62)"><rect x="-10" y="-7" width="20" height="14" rx="2" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.4" /><path d="M-10 -7 L0 1 L10 -7" fill="none" stroke="var(--outline)" strokeWidth="1.4" /></g>}
        {milestone === "zusage" && <g transform="translate(0 -56)"><rect x="-1" y="-20" width="2" height="20" fill="var(--outline)" /><polygon points="1,-20 15,-15 1,-10" fill="var(--mint)" stroke="var(--outline)" strokeWidth="1.2" strokeLinejoin="round" /></g>}
        {milestone === "vertrag" && <g transform="translate(18 -58) rotate(8)"><rect x="-8" y="-10" width="16" height="20" rx="1.5" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.3" /><path d="M-4 -4 h8 M-4 0 h8 M-4 5 q2 -3 4 0 t4 0" fill="none" stroke="var(--outline)" strokeWidth="1.1" /></g>}
      </g>
    </svg>
  );
}
