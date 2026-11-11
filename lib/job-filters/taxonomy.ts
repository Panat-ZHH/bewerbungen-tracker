// Fields (branches), labels and text classification of listings. Pure regex heuristics.
import type { EducationLevel, EnrichedJob, JobMeta, JobType, PostedWithin } from "./types.ts";
import { cantonInText } from "../geo/cantons.ts";

export interface FieldInfo { id: string; label: string; pattern: RegExp }

export const FIELDS: FieldInfo[] = [
  { id: "informatik", label: "Informatik & Technologie", pattern: /informatik|\bict\b|\bit[- ]|software|entwickl|developer|engineer|devops|applikation|plattform|mediamatik|web|daten|data|cyber|system(?:administr|techn)|netzwerk/i },
  { id: "kaufmaennisch", label: "Büro & Kaufmännisch", pattern: /kaufmann|kauffrau|kaufm[aä]nn|\bkv\b|büro|buero|sachbearbeit|assistent|sekret|administrat|office|empfang|\bhr\b|personal/i },
  { id: "detailhandel", label: "Detailhandel & Verkauf", pattern: /detailhandel|verk[aä]uf|verkauf|filial|kasse|\bdhf\b|\bdha\b|kundenberat|retail/i },
  { id: "gesundheit", label: "Gesundheit & Pflege", pattern: /gesundheit|pflege|\bfage\b|medizin|arzt|ärzt|praxis|spital|apothek|pharma|dental|zahn|therap|physio|\bmpa\b|rettung|betreuung/i },
  { id: "soziales", label: "Soziales & Bildung", pattern: /sozial|kinder|kita|fabe|lehrer|pädagog|paedagog|erzieh|bildung|schule|betreuer/i },
  { id: "handwerk-bau", label: "Handwerk & Bau", pattern: /bau|maurer|zimmer|schreiner|maler|gipser|dach|sanit[aä]r|heizung|plattenleger|strassen|gleis|haustechnik|installateur|montage|metallbau|schlosser|spengler|glas/i },
  { id: "technik-industrie", label: "Technik & Industrie", pattern: /mechanik|mechatronik|polymechan|elektro|elektronik|automatik|konstruk|produktion|maschin|industrie|labor|chemie|werkstoff|fertigung|zerspan|anlage|operator|techniker/i },
  { id: "gastro-hotel", label: "Gastronomie & Hotel", pattern: /koch|köchin|koechin|restaurant|hotel|gastro|service|küche|kueche|bäcker|baecker|konditor|metzger|fleisch|hauswirtschaft|systemgastro/i },
  { id: "logistik", label: "Logistik & Transport", pattern: /logistik|lager|transport|chauffeur|fahrer|spedition|post|zoll|umschlag|verlad/i },
  { id: "finanz-recht", label: "Finanzen & Recht", pattern: /bank|finanz|versicher|treuhand|buchhal|revision|steuer|recht|jurist|anwalt|controlling|accounting|immobili/i },
  { id: "gestaltung-medien", label: "Gestaltung & Medien", pattern: /grafik|gestalt|design|medien|print|polygraf|foto|marketing|kommunikation|redakt|journal|werbe|event/i },
  { id: "natur", label: "Natur & Umwelt", pattern: /gärtner|gaertner|landwirt|forst|natur|umwelt|tier|pferd|garten|wald|agrar|floristik|weinbau|obstbau/i },
  { id: "sicherheit-oeffentlich", label: "Sicherheit & Verwaltung", pattern: /polizei|sicherheit|zoll|verwaltung|gemeinde|stadt|kanton|bund|militär|feuerwehr|grenzwach/i },
];

export const FIELD_IDS = FIELDS.map((f) => f.id);
export const fieldLabel = (id: string) => FIELDS.find((f) => f.id === id)?.label ?? id;

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  lehrstelle: "Lehrstelle", schnupperlehre: "Schnupperlehre", praktikum: "Praktikum", vollzeit: "Vollzeit", teilzeit: "Teilzeit", temporaer: "Temporär", freelance: "Freelance / Mandat", other: "Andere",
};
export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  efz: "EFZ (Lehre)", eba: "EBA (Attest)", bm: "Berufsmatura", hf: "Höhere Fachschule", fh: "Fachhochschule", uni: "Universität / ETH", none: "Keine Anforderung",
};
export const LANGUAGE_LABELS: Record<string, string> = { de: "Deutsch", fr: "Französisch", it: "Italienisch", en: "Englisch" };
export const REMOTE_LABELS = { remote: "Remote", hybrid: "Hybrid / Homeoffice", onsite: "Vor Ort" } as const;
export const POSTED_WITHIN_OPTIONS: PostedWithin[] = [1, 3, 7, 14, 30];
export const postedWithinLabel = (days: PostedWithin) => (days === 1 ? "Letzte 24 Stunden" : `Letzte ${days} Tage`);
/** Radius around the chosen place in km; 0 = "Nur dieser Ort" (same municipality). Only meaningful with a place. */
export const RADIUS_OPTIONS = [0, 5, 10, 20, 30, 50] as const;
export const DEFAULT_RADIUS_KM = 10;
export const radiusLabel = (km: number) => (km === 0 ? "Nur dieser Ort" : `${km} km`);
/** Radius in effect for a filter state with a place: the chosen value or the default of 10 km. */
export const effectiveRadiusKm = (filters: { radiusKm?: number }) => filters.radiusKm ?? DEFAULT_RADIUS_KM;
/** "12 km" / "< 1 km" for a result card; undefined when the listing has no distance. */
export function formatDistance(km: number | undefined): string | undefined {
  if (km === undefined || !Number.isFinite(km) || km < 0) return undefined;
  return km < 1 ? "< 1 km" : `${Math.round(km)} km`;
}
export const JOB_TYPES = Object.keys(JOB_TYPE_LABELS) as JobType[];
export const EDUCATION_LEVELS = Object.keys(EDUCATION_LABELS) as EducationLevel[];
export const LANGUAGES = Object.keys(LANGUAGE_LABELS);

type Source = Pick<EnrichedJob, "title" | "company" | "location" | "snippet" | "contract">;
const text = (job: Source) => [job.title, job.contract, job.snippet].filter(Boolean).join(" · ");

/** Classify the best-matching field id from title/snippet; title hits win over snippet hits. */
export function classifyField(job: Source): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const field of FIELDS) {
    const t = field.pattern.test(job.title) ? 3 : 0;
    const s = job.snippet && field.pattern.test(job.snippet) ? 1 : 0;
    const c = job.company && /apotheke|spital|praxis|bank|versicherung/i.test(job.company) && field.pattern.test(job.company) ? 1 : 0;
    const score = t + s + c;
    if (score > 0 && (!best || score > best.score)) best = { id: field.id, score };
  }
  return best?.id;
}

export function parseWorkload(value: string): { min: number; max: number } | undefined {
  const range = value.match(/(\d{2,3})\s*(?:-|–|—|bis|à|a)\s*(\d{2,3})\s*%/i);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    if (a >= 10 && b <= 100) return { min: a, max: b };
  }
  const single = value.match(/(?:pensum|auslastung|arbeitspensum|taux d'activit[eé])[:\s]*(\d{2,3})\s*%|(\d{2,3})\s*%\s*(?:pensum|stelle|anstellung)?/i);
  const n = Number(single?.[1] ?? single?.[2]);
  if (n >= 10 && n <= 100) return { min: n, max: n };
  return undefined;
}

export function parseEducation(value: string): EducationLevel | undefined {
  if (/\beba\b|attest/i.test(value)) return "eba";
  if (/\befz\b|fähigkeitszeugnis|faehigkeitszeugnis|\bcfc\b|berufslehre|lehrstelle|\blehre\b/i.test(value)) return "efz";
  if (/berufsmatur|\bbm\b|\bbms\b|\bfms\b|gymnasi/i.test(value)) return "bm";
  if (/\bhf\b|höhere fachschule|hoehere fachschule|dipl\.? techniker/i.test(value)) return "hf";
  if (/\bfh\b|fachhochschule|bachelor|\bbsc\b|\bhes\b|\bzhaw\b|\bfhnw\b/i.test(value)) return "fh";
  if (/\bmaster\b|\bmsc\b|\beth\b|universit|doktor|\bphd\b|\bepfl\b/i.test(value)) return "uni";
  return undefined;
}

export function parseStartYear(value: string, preferLoose = false): number | undefined {
  const explicit = value.match(/(?:lehrbeginn|lehrstart|start|beginn|eintritt|ab|per|rentrée|début|debut)[^0-9]{0,24}((?:0?[1-9]|[12]\d|3[01])?[./\s-]*(?:0?[1-9]|1[0-2])?[./\s-]*)?(20[2-3]\d)/i);
  if (explicit) return Number(explicit[2]);
  if (preferLoose) {
    const loose = value.match(/\b(20[2-3]\d)\b/);
    if (loose) return Number(loose[1]);
  }
  return undefined;
}

export function parseRemote(value: string): JobMeta["remote"] {
  if (/100\s*%\s*(?:remote|homeoffice|home office)|fully remote|vollständig remote|vollstaendig remote|komplett remote|remote only|remote[- ]first/i.test(value)) return "remote";
  if (/home\s?-?office|hybrid|mobiles arbeiten|teilweise remote|remote|télétravail|teletravail|telearbeit/i.test(value)) return /remote(?!\s*arbeit)\b/i.test(value) && !/hybrid|teilweise/i.test(value) ? "remote" : "hybrid";
  return undefined;
}

export function parseLanguage(value: string): string | undefined {
  const lower = ` ${value.toLowerCase()} `;
  const score = (words: string[]) => words.filter((w) => lower.includes(` ${w} `)).length;
  const fr = score(["chez", "emploi", "apprenti", "apprentie", "poste", "recherche", "stagiaire", "ingénieur", "employé", "employée", "pour", "avec", "dès"]);
  const en = score(["manager", "developer", "engineer", "specialist", "senior", "junior", "intern", "analyst", "officer", "assistant", "sales", "and", "for"]);
  const it = score(["presso", "lavoro", "apprendista", "tirocinio", "ricerca", "impiegato", "impiegata"]);
  const de = score(["und", "für", "fuer", "mit", "lehrstelle", "mitarbeiter", "mitarbeitende", "fachmann", "fachfrau", "sachbearbeiter", "sachbearbeiterin", "leiter", "leiterin", "berater", "beraterin"]) + (/[a-z]+(?:ung|keit|heit|schaft)\b/i.test(value) ? 1 : 0);
  const best = Math.max(fr, en, it, de);
  if (best === 0) return undefined;
  if (de === best) return "de";
  if (fr === best) return "fr";
  if (it === best) return "it";
  return "en";
}

/** All type signals of a listing (a "Praktikum 50%" is both praktikum and teilzeit). */
export function detectJobTypes(job: Source & Partial<JobMeta>): JobType[] {
  const found = new Set<JobType>();
  if (job.jobType) found.add(job.jobType);
  const t = text(job);
  if (/lehrstelle|\blehre\b|lehrling|\befz\b|\beba\b|ausbildung|berufslehre|apprenti|apprentissage|\bstift\b|lehrbeginn/i.test(t)) found.add("lehrstelle");
  if (/schnupper|\bstage d.observation\b|\bstage d.essai\b/i.test(t)) found.add("schnupperlehre");
  if (/praktik|\bstage\b|stagiaire|internship|volontariat|\bintern\b/i.test(t)) found.add("praktikum");
  if (/teilzeit|part[- ]?time|temps partiel/i.test(t) || (job.workloadMax !== undefined && job.workloadMax < 100)) found.add("teilzeit");
  if (/vollzeit|full[- ]?time|temps plein|100\s*%/i.test(t) || (job.workloadMin === 100)) found.add("vollzeit");
  if (/tempor[aä]r|befristet|aushilfe|temporaire|\bcdd\b|zeitarbeit|einsatz auf zeit/i.test(t)) found.add("temporaer");
  if (/freelance|freiberuf|selbst[aä]ndig|\bmandat\b|auftrag/i.test(t)) found.add("freelance");
  if (found.size === 0 && /festanstellung|unbefristet|\bcdi\b|permanent/i.test(t)) found.add("vollzeit");
  return [...found];
}

/** Derive meta from the visible text of a listing. Only includes keys that could be derived. */
export function classifyJob(job: Source & Partial<JobMeta>): JobMeta {
  const full = text(job);
  const out: JobMeta = {};
  const types = detectJobTypes(job);
  out.jobType = types.includes("schnupperlehre") ? "schnupperlehre" : types.includes("lehrstelle") ? "lehrstelle" : types.includes("praktikum") ? "praktikum" : types[0];
  const workload = parseWorkload(full);
  if (workload) { out.workloadMin = workload.min; out.workloadMax = workload.max; }
  out.education = parseEducation(full) ?? (out.jobType === "lehrstelle" ? "efz" : undefined);
  out.startDate = undefined;
  const year = parseStartYear(full, out.jobType === "lehrstelle" || out.jobType === "praktikum");
  if (year) out.startDate = String(year);
  out.remote = parseRemote(full);
  out.language = parseLanguage(full);
  out.field = classifyField(job);
  // the search API sets the canton from the localities directory; this is only the fallback for a canton written in the text
  out.canton = cantonInText(job.location);
  for (const key of Object.keys(out) as (keyof JobMeta)[]) if (out[key] === undefined) delete out[key];
  return out;
}

const cache = new WeakMap<object, EnrichedJob>();
/** Provider-supplied fields win; missing ones are filled from classification. Cached per object; never mutates the input. */
export function enrichJob(job: EnrichedJob): EnrichedJob {
  const cached = cache.get(job);
  if (cached) return cached;
  const derived = classifyJob(job);
  const merged: EnrichedJob = { ...derived, ...Object.fromEntries(Object.entries(job).filter(([, v]) => v !== undefined)) } as EnrichedJob;
  cache.set(job, merged);
  return merged;
}

/** Start year of a listing as a number (from startDate "2027" / "2027-08-01" or `years`). */
export function startYearOf(job: EnrichedJob): number | undefined {
  const fromDate = job.startDate?.match(/20\d{2}/)?.[0];
  if (fromDate) return Number(fromDate);
  const years = (job.years ?? []).map(Number).filter((y) => y >= 2020 && y <= 2040).sort();
  return years[0];
}
