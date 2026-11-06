// Timeline of an application derived from its dates (no extra table): saved, sent, deadline, last change.
import type { Application } from "../types/index.ts";

export type TimelineEntry = { key: string; label: string; date: string; dateLabel: string; future: boolean };

const fmt = (date: string) => new Date(date).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
const day = (date: string) => date.slice(0, 10);

export function applicationTimeline(application: Pick<Application, "createdAt" | "appliedAt" | "deadline" | "updatedAt" | "status">, now = new Date()): TimelineEntry[] {
  const today = day(now.toISOString());
  const entries: TimelineEntry[] = [];
  const add = (key: string, label: string, date?: string) => {
    if (!date || Number.isNaN(new Date(date).getTime())) return;
    entries.push({ key, label, date: day(date), dateLabel: fmt(date), future: day(date) > today });
  };
  add("created", "Gemerkt", application.createdAt);
  if (application.deadline && ["saved", "preparing"].includes(application.status)) add("deadline", "Bewerbungsfrist", application.deadline);
  add("applied", "Bewerbung abgeschickt", application.appliedAt);
  if (application.updatedAt && day(application.updatedAt) !== day(application.createdAt) && day(application.updatedAt) !== (application.appliedAt ? day(application.appliedAt) : "")) add("updated", "Zuletzt geändert", application.updatedAt);
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
