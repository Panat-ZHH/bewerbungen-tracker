import type { SVGProps } from "react";

// Small hand-drawn doodles (inline SVG, stroke = currentColor). Decorative: always aria-hidden.
// Size and colour via className, e.g. <DoodleArrow className="h-10 w-14 text-[var(--brand)]" />.
type Props = SVGProps<SVGSVGElement>;
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

/** Curvy arrow pointing down-right. */
export function DoodleArrow(props: Props) {
  return <svg viewBox="0 0 64 48" {...base} {...props}><path d="M4 8c14-6 34-3 42 12 3 6 3 13 1 19" /><path d="M37 30c3 4 6 7 10 10 2-5 5-9 9-13" /></svg>;
}

/** Arrow with a loop, pointing right. */
export function DoodleLoopArrow(props: Props) {
  return <svg viewBox="0 0 80 40" {...base} {...props}><path d="M3 28c10-2 20-8 26-15 4-5 3-10-2-9-6 1-7 12 0 17 10 7 28 5 46-4" /><path d="M63 9c4 2 7 4 11 8-4 3-7 6-9 11" /></svg>;
}

/** Five-point star, slightly wonky. */
export function DoodleStar(props: Props) {
  return <svg viewBox="0 0 40 40" {...base} {...props}><path d="M20 4l4.6 10.2 11 1.2-8.3 7.5 2.5 11L20 28.2 10.2 33.9l2.5-11-8.3-7.5 11-1.200z" /></svg>;
}

/** Four-point sparkle. */
export function DoodleSparkle(props: Props) {
  return <svg viewBox="0 0 32 32" {...base} {...props}><path d="M16 3c1 7 3 10 13 13-10 3-12 6-13 13-1-7-3-10-13-13 10-3 12-6 13-13z" fill="currentColor" stroke="none" /></svg>;
}

/** Kringel: a loose scribbled spiral. */
export function DoodleSquiggle(props: Props) {
  return <svg viewBox="0 0 48 48" {...base} {...props}><path d="M24 25c-2-3 3-6 6-2 4 5-2 12-9 10-9-3-11-15-3-21 10-8 26 0 25 14-1 12-12 19-25 17" /></svg>;
}

/** Wavy underline; stretch it under a word with preserveAspectRatio="none". */
export function DoodleUnderline(props: Props) {
  return <svg viewBox="0 0 120 12" preserveAspectRatio="none" {...base} strokeWidth={3.2} {...props}><path d="M3 7c12-5 20 4 32 0s20-5 32 0 20 4 32 0c6-2 12-2 18-1" /></svg>;
}

/** Three short "pop" lines, e.g. next to a headline or sticker. */
export function DoodleBurst(props: Props) {
  return <svg viewBox="0 0 32 32" {...base} {...props}><path d="M6 14 3 6M15 9V2M24 13l5-7" /></svg>;
}

/** Smiling face. */
export function DoodleSmile(props: Props) {
  return <svg viewBox="0 0 40 40" {...base} {...props}><path d="M20 4c9 0 16 7 16 16s-7 16-16 16S4 29 4 20 11 4 20 4z" /><path d="M13 23c2 4 5 5 7 5s5-1 7-5M14 15v2M26 15v2" /></svg>;
}

/** Paper plane: "Bewerbung ist unterwegs". */
export function DoodlePlane(props: Props) {
  return <svg viewBox="0 0 56 44" {...base} {...props}><path d="M4 20 52 4 36 40 25 26z" /><path d="M25 26 52 4M25 26l-3 11 7-6" /></svg>;
}

/** Dashed flight path that ends in a loop (pairs with DoodlePlane). */
export function DoodleTrail(props: Props) {
  return <svg viewBox="0 0 120 40" {...base} strokeDasharray="1 9" {...props}><path d="M4 34c20 4 34-2 40-12 5-9-3-16-9-10-7 8 6 20 26 16 18-4 36-14 54-22" /></svg>;
}
