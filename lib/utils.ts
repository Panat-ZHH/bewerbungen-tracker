import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const statusLabels = {
  saved: "Gemerkt",
  preparing: "In Vorbereitung",
  applied: "Abgeschickt",
  interview: "Gespräch",
  final_interview: "Weiteres Gespräch",
  offer: "Zusage",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
} as const;