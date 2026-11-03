import type { Application, ApplicationStatus } from "../types/index.ts";

export const buildingStages = {
  saved: { label: "Baustelle", floors: 0, color: "#c49442", workers: true },
  preparing: { label: "Rohbau", floors: 1, color: "#c49442", workers: true },
  applied: { label: "Haus", floors: 1, color: "#4887ac", workers: false },
  interview: { label: "Bürohaus", floors: 2, color: "#397f86", workers: false },
  final_interview: { label: "Büroturm", floors: 3, color: "#526cad", workers: false },
  offer: { label: "Mit Flagge", floors: 3, color: "#308058", workers: false },
  rejected: { label: "Geschlossen", floors: 1, color: "#976974", workers: false },
  withdrawn: { label: "Stillgelegt", floors: 1, color: "#737a80", workers: false },
} satisfies Record<ApplicationStatus, { label: string; floors: number; color: string; workers: boolean }>;

export function createApplicationMap(applications: Application[]) {
  const ordered = [...applications].sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id));
  const plots = ordered.map((application, index) => ({
    application,
    x: 390 + (index % 3) * 320 + (Math.floor(index / 3) % 2 === 0 ? -12 : 12),
    y: 270 + Math.floor(index / 3) * 360 + [-12, 24, -24][index % 3],
  }));
  return { plots, width: 1280, height: Math.max(900, Math.ceil(plots.length / 3) * 360 + 280) };
}