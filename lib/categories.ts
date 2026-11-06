// Berufsfelder of an application = the 13 search categories (lib/job-filters/taxonomy FIELDS) + "other".
import { FIELDS } from "./job-filters/taxonomy.ts";
import type { ApplicationCategory } from "../types/index.ts";

export const CATEGORY_OPTIONS: { value: ApplicationCategory; label: string }[] = [
  ...FIELDS.map((field) => ({ value: field.id as ApplicationCategory, label: field.label })),
  { value: "other", label: "Anderes" },
];

/** Old adult categories (before this change) mapped onto the new ones; unknown values become "other". */
const LEGACY: Record<string, ApplicationCategory> = {
  software: "informatik",
  sales: "detailhandel",
  business: "kaufmaennisch",
  finance: "finanz-recht",
  banking: "finanz-recht",
  consulting: "kaufmaennisch",
};

export function normalizeCategory(value: unknown): ApplicationCategory {
  if (typeof value !== "string") return "other";
  if (CATEGORY_OPTIONS.some((option) => option.value === value)) return value as ApplicationCategory;
  return LEGACY[value] ?? "other";
}

export function categoryLabel(value: unknown): string {
  const category = normalizeCategory(value);
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "Anderes";
}
