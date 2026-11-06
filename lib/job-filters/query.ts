// Query normalisation, German/Swiss synonym expansion and typo-tolerant token matching. Pure TS, no imports besides types.

/** Lowercase, strip diacritics, ß->ss, everything non-alphanumeric becomes a single space. */
export function normalize(value: string): string {
  return value.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** normalize + collapse German umlaut digraphs, so "Zürich", "Zuerich" and "Zurich" all become "zurich". */
export function fold(value: string): string {
  return normalize(value.replace(/ä/gi, "a").replace(/ö/gi, "o").replace(/ü/gi, "u")).replace(/ae|oe|ue/g, (m) => m[0]);
}

const STOPWORDS = new Set(["in", "im", "innen", "als", "fur", "fuer", "bei", "und", "mit", "am", "der", "die", "das", "ein", "eine", "zum", "zur", "von", "m", "w", "d", "f", "h", "x", "a", "an", "oder", "et", "de", "le", "la", "les", "du", "des"]);

/** Folded tokens of a query (stopwords and gender markers like "/in" or "(m/w/d)" removed). */
export function tokenize(value: string): string[] {
  return fold(value).split(" ").filter((token) => token && !STOPWORDS.has(token));
}

export interface TokenSpan { text: string; start: number; end: number }

/** Folded tokens of a text with their positions in the ORIGINAL string (for highlighting). */
export function tokenSpans(value: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  for (const match of value.matchAll(/[\p{L}\p{N}]+/gu)) {
    const text = fold(match[0]).replace(/ /g, "");
    if (text) spans.push({ text, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return spans;
}

/** Synonym groups. Entries are free text and are folded at load time; multi-word entries match all words. */
const SYNONYM_SOURCE: string[][] = [
  ["lehrstelle", "lehrstellen", "lehre", "berufslehre", "ausbildung", "ausbildungsplatz", "berufsausbildung", "lehrling", "stift", "efz", "eba", "apprenti", "apprentissage", "apprenticeship"],
  ["praktikum", "praktikant", "praktikumsstelle", "praktika", "stage", "stagiaire", "internship", "intern", "volontariat", "volontaer"],
  ["teilzeit", "teilzeitpensum", "teilzeitstelle", "part time", "parttime", "temps partiel"],
  ["vollzeit", "vollzeitstelle", "full time", "fulltime", "temps plein"],
  ["informatiker", "informatik", "informatikerin", "ict", "it", "developer", "entwickler", "softwareentwickler", "software entwickler", "software developer", "software engineer", "applikationsentwickler", "applikationsentwicklung", "plattformentwickler", "fachmann information", "fachfrau information", "informaticien"],
  ["kaufmann", "kauffrau", "kaufleute", "kv", "kaufmannisch", "kaufmaennisch", "employe de commerce", "commerce", "buroassistent", "bueroassistent"],
  ["detailhandel", "detailhandelsfachmann", "detailhandelsfachfrau", "detailhandelsassistent", "dhf", "verkauf", "verkaufer", "verkaeufer", "verkaeuferin", "gestionnaire du commerce de detail"],
  ["polymechaniker", "polymechanikerin", "mechaniker", "produktionsmechaniker", "polymecanicien", "automatiker"],
  ["fage", "fachmann gesundheit", "fachfrau gesundheit", "pflegefachmann", "pflegefachfrau", "pflege", "assistant en soins et sante communautaire"],
  ["elektroinstallateur", "elektroinstallateurin", "elektriker", "elektroinstallation", "electricien"],
  ["logistiker", "logistikerin", "lagerist", "logistik", "magasinier"],
  ["koch", "kochin", "koechin", "cuisinier", "cuisiniere"],
  ["mediamatiker", "mediamatikerin", "mediamatik"],
  ["schreiner", "schreinerin", "tischler"],
  ["coiffeur", "coiffeuse", "friseur", "friseurin"],
  ["baecker", "backer", "baeckerin", "konditor", "boulanger"],
  ["gartner", "gaertner", "gaertnerin", "landschaftsgartner", "gartenbau"],
  ["zeichner", "zeichnerin", "bauzeichner", "bauzeichnerin", "dessinateur"],
  ["grafiker", "grafikerin", "gestalter", "gestalterin", "polygraf", "graphiste"],
  ["homeoffice", "home office", "remote", "mobiles arbeiten", "telearbeit", "teletravail"],
  ["student", "studentin", "werkstudent", "werkstudentin"],
  ["zurich", "zuerich", "zurigo"],
  ["genf", "geneve", "geneva", "ginevra"],
  ["basel", "bale", "basilea"],
  ["bern", "berne", "berna"],
  ["luzern", "lucerne", "lucerna"],
  ["st gallen", "sankt gallen", "saint gall", "san gallo"],
  ["neuenburg", "neuchatel"],
  ["freiburg", "fribourg", "friburgo"],
  ["wallis", "valais"],
  ["tessin", "ticino"],
  ["graubunden", "graubuenden", "grisons"],
];

export interface SynonymEntry { tokens: string[]; text: string; label: string }
export const SYNONYM_GROUPS: SynonymEntry[][] = SYNONYM_SOURCE.map((group) => {
  const seen = new Set<string>();
  const entries: SynonymEntry[] = [];
  for (const raw of group) {
    const tokens = tokenize(raw);
    const folded = tokens.length ? tokens : fold(raw).split(" ").filter(Boolean);
    const text = folded.join(" ");
    if (text && !seen.has(text)) { seen.add(text); entries.push({ tokens: folded, text, label: raw }); }
  }
  return entries;
});

export interface QueryAlt { tokens: string[]; weight: number }
export interface QueryTerm { text: string; alts: QueryAlt[] }
export interface ExpandedQuery {
  terms: QueryTerm[];
  /** Human readable synonym hints, e.g. "Lehrstelle → Lehre, EFZ, Ausbildung" (for the UI). */
  hints: { term: string; synonyms: string[] }[];
  /** Normalised plain query tokens joined (for phrase boosts). */
  phrase: string;
}

/** Maximum edit distance allowed for a token of this length. */
export function maxEditDistance(length: number): number {
  return length >= 8 ? 2 : length >= 4 ? 1 : 0;
}

/** Optimal string alignment distance (Levenshtein + adjacent transposition) with an early exit above `limit`. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) { rows.push(new Array(b.length + 1).fill(0)); rows[i][0] = i; }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

/** Quality 0..1 of a query token `q` matching a text token `t` (both folded). 0 = no match. */
export function tokenMatch(q: string, t: string): number {
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (q.length >= 3 && t.startsWith(q)) return 0.85;
  if (t.length >= 5 && q.length > t.length && q.startsWith(t)) return 0.7;
  if (q.length >= 4 && t.includes(q)) return 0.6;
  const allowed = maxEditDistance(q.length);
  if (allowed) {
    const d = editDistance(q, t, allowed);
    if (d <= allowed) return d === 1 ? 0.5 : 0.4;
    if (q.length >= 5 && t.length > q.length) {
      const pd = editDistance(q, t.slice(0, q.length), 1);
      if (pd <= 1) return 0.45;
    }
  }
  return 0;
}

function stripGender(token: string): string | undefined {
  if (token.length > 6 && token.endsWith("innen")) return token.slice(0, -5);
  if (token.length > 6 && token.endsWith("in")) return token.slice(0, -2);
  return undefined;
}

function entryMatchesAt(tokens: string[], at: number, entry: SynonymEntry): boolean {
  if (at + entry.tokens.length > tokens.length) return false;
  return entry.tokens.every((token, offset) => {
    const q = tokens[at + offset];
    if (q === token) return true;
    return q.length >= 5 && token.length >= 5 && editDistance(q, token, 1) <= 1;
  });
}


/** Expand a user query into AND-terms, each an OR over synonym alternatives. Typos in synonym keys are tolerated. */
export function expandQuery(query: string): ExpandedQuery {
  const tokens = tokenize(query);
  const terms: QueryTerm[] = [];
  const hints: ExpandedQuery["hints"] = [];
  let i = 0;
  while (i < tokens.length) {
    let best: { group: SynonymEntry[]; length: number } | undefined;
    for (const group of SYNONYM_GROUPS) {
      for (const entry of group) {
        if (entryMatchesAt(tokens, i, entry) && (!best || entry.tokens.length > best.length)) best = { group, length: entry.tokens.length };
      }
    }
    if (!best) {
      const stripped = stripGender(tokens[i]);
      for (const group of SYNONYM_GROUPS) {
        if (stripped && group.some((entry) => entry.text === stripped)) { best = { group, length: 1 }; break; }
      }
    }
    if (best) {
      const text = tokens.slice(i, i + best.length).join(" ");
      const alts: QueryAlt[] = [{ tokens: tokens.slice(i, i + best.length), weight: 1 }];
      const stripped = best.length === 1 ? stripGender(tokens[i]) : undefined;
      if (stripped) alts.push({ tokens: [stripped], weight: 0.95 });
      for (const entry of best.group) if (!alts.some((alt) => alt.tokens.join(" ") === entry.text)) alts.push({ tokens: entry.tokens, weight: 0.8 });
      terms.push({ text, alts });
      hints.push({ term: text, synonyms: best.group.map((entry) => entry.label).filter((label) => fold(label) !== text).slice(0, 6) });
      i += best.length;
    } else {
      const alts: QueryAlt[] = [{ tokens: [tokens[i]], weight: 1 }];
      const stripped = stripGender(tokens[i]);
      if (stripped) alts.push({ tokens: [stripped], weight: 0.95 });
      terms.push({ text: tokens[i], alts });
      i += 1;
    }
  }
  return { terms, hints, phrase: tokens.join(" ") };
}

/**
 * A few alternative query strings for server side searches (original first, then one per synonym-expanded term),
 * at most `max`. Useful for providers that only take a plain text query.
 */
export function queryVariants(query: string, max = 3): string[] {
  const original = query.trim();
  if (!original) return [];
  const out = [original];
  const expanded = expandQuery(original);
  expanded.terms.forEach((term, index) => {
    for (const alt of term.alts.slice(1, 3)) {
      const parts = expanded.terms.map((t, i) => (i === index ? alt.tokens.join(" ") : t.text));
      const variant = parts.join(" ");
      if (!out.includes(variant)) out.push(variant);
    }
  });
  return out.slice(0, max);
}
