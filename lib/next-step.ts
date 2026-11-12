// Pure dashboard helpers (no browser/Supabase imports so node --test can load them):
// the ONE concrete next step shown under the greeting, and the counts for the progress path.
import type { Application, ApplicationStatus } from "../types/index.ts";

export type NextStep = { text: string; href: string; cta: string };
export type PathStage = "saved" | "sent" | "talk" | "placed";
export type PathCounts = Record<PathStage, number> & { rejected: number; total: number };

const STAGE: Partial<Record<ApplicationStatus, PathStage>> = {
  saved: "saved", preparing: "saved",
  applied: "sent", schnupper_planned: "sent", schnupper_done: "sent", aptitude_test: "sent",
  interview: "talk", final_interview: "talk",
  offer: "placed", contract_signed: "placed",
};
export const PATH_STAGES: PathStage[] = ["saved", "sent", "talk", "placed"];
export const pathLabels: Record<PathStage, string> = { saved: "Gemerkt", sent: "Abgeschickt", talk: "Gespräch", placed: "Zusage" };

/** Where each application stands on the path Gemerkt → Abgeschickt → Gespräch → Zusage (Absagen are counted apart, withdrawn ones not at all). */
export function pathCounts(applications: Pick<Application, "status">[]): PathCounts {
  const counts: PathCounts = { saved: 0, sent: 0, talk: 0, placed: 0, rejected: 0, total: applications.length };
  for (const { status } of applications) {
    const stage = STAGE[status];
    if (stage) counts[stage] += 1;
    else if (status === "rejected") counts.rejected += 1;
  }
  return counts;
}

/** Furthest stage that has at least one application (null when there is none on the path). */
export function furthestStage(counts: PathCounts): PathStage | null {
  for (let i = PATH_STAGES.length - 1; i >= 0; i--) if (counts[PATH_STAGES[i]] > 0) return PATH_STAGES[i];
  return null;
}

const dayNumber = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; };
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** First name for the greeting ("Hoi Panat!"); empty when the name is a placeholder such as an e-mail address. */
export function firstName(name?: string | null): string {
  const value = (name ?? "").trim();
  if (!value || value.includes("@") || value.toLowerCase() === "nutzer") return "";
  return value.split(/\s+/)[0];
}

/** Exactly one next step, picked by urgency. `today` as YYYY-MM-DD. Warm, "du", Swiss spelling. */
export function nextStep(applications: Pick<Application, "id" | "company" | "status" | "deadline">[], today: string): NextStep {
  if (applications.length === 0) return { text: "Bereit für deine erste Bewerbung?", href: "/applications/new", cta: "Erste Bewerbung eintragen" };
  const by = (...list: ApplicationStatus[]) => applications.filter((a) => list.includes(a.status));
  const talks = by("interview", "final_interview");
  if (talks.length) return { text: talks.length === 1 ? `Dein Gespräch bei ${talks[0].company} steht an. Bereite dich vor!` : `${talks.length} Gespräche stehen an. Bereite dich vor!`, href: talks.length === 1 ? `/applications/${talks[0].id}` : "/applications", cta: "Ansehen" };
  const now = dayNumber(today);
  const due = by("saved", "preparing")
    .map((a) => ({ a, days: a.deadline && now !== null ? (dayNumber(a.deadline) ?? Infinity) - now : Infinity }))
    .filter(({ days }) => days >= 0 && days <= 7)
    .sort((x, y) => x.days - y.days)[0];
  if (due) return { text: `${due.a.company}: Bewerben bis ${due.days === 0 ? "heute" : due.days === 1 ? "morgen" : `in ${due.days} Tagen`}. Schick sie ab!`, href: `/applications/${due.a.id}`, cta: "Fertig machen" };
  const offers = by("offer");
  if (offers.length) return { text: `Du hast eine Zusage von ${offers[0].company}. Gratulation! Fehlt nur noch der Vertrag.`, href: `/applications/${offers[0].id}`, cta: "Ansehen" };
  const schnupper = by("schnupper_planned");
  if (schnupper.length) return { text: `Schnupperlehre bei ${schnupper[0].company} geplant. Viel Spass!`, href: `/applications/${schnupper[0].id}`, cta: "Ansehen" };
  const waiting = by("applied", "aptitude_test", "schnupper_done");
  if (waiting.length) return { text: `${n(waiting.length, "Bewerbung wartet", "Bewerbungen warten")} auf Antwort.`, href: "/applications", cta: "Nachschauen" };
  const preparing = by("preparing");
  if (preparing.length) return { text: `${n(preparing.length, "Bewerbung ist", "Bewerbungen sind")} in Vorbereitung. Mach eine davon fertig!`, href: preparing.length === 1 ? `/applications/${preparing[0].id}` : "/applications", cta: "Weitermachen" };
  const saved = by("saved");
  if (saved.length) return { text: `${n(saved.length, "gemerkte Stelle wartet", "gemerkte Stellen warten")} auf dich.`, href: "/applications", cta: "Loslegen" };
  if (by("contract_signed").length) return { text: "Vertrag unterschrieben. Du hast deine Lehrstelle!", href: "/applications", cta: "Ansehen" };
  return { text: "Zeit für etwas Neues: Such dir die nächste Stelle.", href: "/search", cta: "Stellen suchen" };
}
