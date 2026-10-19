import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const statusLabels = {
  saved: "Merken",
  preparing: "Vorbereiten",
  applied: "Abgeschickt",
  interview: "Gespräch",
  final_interview: "Weiteres Gespräch",
  offer: "Angebot",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
} as const;