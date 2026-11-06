// Free-text search understands a trailing place: "Informatiker Zürich" -> query "Informatiker", location "Zürich".
import { CANTONS, resolveLocation } from "./job-filters/geo.ts";

export interface ParsedQuery { query: string; location: string }

const FILLER = /\s+(?:in|bei|nahe|um|region)$/i;

/** Splits a place off the end of a free-text query. Only splits when the tail is a known city, PLZ or canton name. */
export function splitPlace(input: string): ParsedQuery {
  const text = input.trim().replace(/\s+/g, " ");
  const words = text.split(" ");
  if (words.length < 2) return { query: text, location: "" };
  for (const size of [1, 2]) {
    if (words.length <= size) continue;
    const tail = words.slice(-size).join(" ");
    const head = words.slice(0, -size).join(" ").replace(FILLER, "").trim();
    if (head.length < 2) continue;
    const isPlz = /^[1-9]\d{3}$/.test(tail) || /^[1-9]\d{3} \p{L}/u.test(tail);
    const knownCanton = CANTONS.some((c) => c.name.toLowerCase() === tail.toLowerCase());
    if (isPlz || knownCanton || resolveLocation(tail)?.city) return { query: head, location: tail };
  }
  return { query: text, location: "" };
}
