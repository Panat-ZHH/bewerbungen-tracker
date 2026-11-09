// Facts shown on result cards (only when data exists) and carried over into a saved application.
import type { JobSearchResult } from "./job-results.ts";

export interface CardFacts { start?: string; deadline?: string; schnupperlehre?: boolean; transit?: string }

export function formatIsoDate(iso: string | undefined): string | undefined {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Reads explicit fields first, then conservative hints from the snippet. */
export function cardFacts(job: JobSearchResult): CardFacts {
  const text = `${job.snippet ?? ""}`;
  const facts: CardFacts = {};
  const start = job.startDate ?? job.years?.[0];
  if (start) facts.start = start;
  let deadline = job.deadline;
  if (!deadline) {
    const m = text.match(/(?:bewerbungs)?frist[^0-9]{0,20}(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
    if (m) deadline = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (deadline) facts.deadline = deadline;
  if (job.schnupperlehre ?? /schnupper/i.test(text)) facts.schnupperlehre = true;
  const transit = job.transit ?? (/(?:s-bahn|bahnhof|haltestelle|öv\b|oev\b)[^.]{0,60}/i.exec(text)?.[0]);
  if (transit) facts.transit = transit.trim();
  return facts;
}

/** Fields copied from a search result into a new application. */
export function applicationExtras(job: JobSearchResult): { deadline?: string; jobDescription?: string; startNote?: string } {
  const facts = cardFacts(job);
  const deadline = facts.deadline && /^\d{4}-\d{2}-\d{2}$/.test(facts.deadline) ? facts.deadline : undefined;
  return { deadline, jobDescription: job.snippet?.trim() || undefined, startNote: facts.start ? `Lehrbeginn: ${facts.start}` : undefined };
}

