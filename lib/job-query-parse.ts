// Free-text search understands a trailing place: "Informatiker Zürich" -> query "Informatiker", location "Zürich".
// It uses the same resolver as the Ort filter (lib/geo/places.ts `geocode`), so both always agree on what a place is.
// Server/test side only (imports the localities directory); the search API runs it and returns the split to the browser.
import { cantonFromName } from "./geo/cantons.ts";
import { geocode, placeKey } from "./geo/places.ts";

export interface ParsedQuery { query: string; location: string; /** canton named instead of a place ("Informatiker Aargau") */ canton?: string }

const FILLER = /\s+(?:in|im|bei|nahe|um|region|raum)$/i;
// Localities whose name is also an everyday word: only a place when written with "in"/"bei" ("Koch in Wald").
const EVERYDAY = new Set(["lohn", "wald", "berg", "stein", "bauen", "buch", "horn", "au", "egg", "matt", "moos", "rain", "ried", "feld", "linden", "halden", "zell", "platten", "hausen", "sand", "port", "heiden", "wiesen", "engi", "lax", "mex", "fey", "rohr", "root", "wasen", "sax", "sent", "vals", "ems", "dorf", "champion", "les", "burg", "hof", "bad", "see", "mauer", "wangen", "wiler", "ins", "the", "post", "bank", "gais", "trub", "wil"]);

/** Splits a place off the end of a free-text query. Only splits when the tail is exactly a known locality, a postcode or a canton name. */
export function splitPlace(input: string): ParsedQuery {
  const text = input.trim().replace(/\s+/g, " ");
  const words = text.split(" ");
  if (words.length < 2) return { query: text, location: "" };
  for (const size of [3, 2, 1]) {
    if (words.length <= size) continue;
    const tail = words.slice(-size).join(" ");
    const rawHead = words.slice(0, -size).join(" ");
    const head = rawHead.replace(FILLER, "").trim();
    if (head.length < 2 || /^(?:in|im|bei|nahe|um|region|raum)\s/i.test(tail)) continue;
    const announced = head !== rawHead.trim();
    const cantonName = tail.replace(/^kanton\s+/i, "");
    const match = /^kanton\s/i.test(tail) ? undefined : geocode(tail, { partial: false });
    if (match && (announced || size > 1 || /^\d{4}$/.test(tail) || !EVERYDAY.has(placeKey(tail)))) return { query: head, location: tail };
    const canton = match ? undefined : cantonFromName(cantonName);
    if (canton) return { query: head, location: "", canton };
  }
  return { query: text, location: "" };
}
