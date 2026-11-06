import type { ApplicationCategory, CVType } from "@/types";

const keywords: Record<ApplicationCategory, string[]> = {
  informatik: ["informatik", "software", "developer", "entwickl", "mediamatik", "web", "daten", "system", "netzwerk", "applikation"],
  kaufmaennisch: ["kaufmann", "kauffrau", "büro", "sachbearbeit", "assistenz", "administration", "sekretariat", "personal"],
  detailhandel: ["detailhandel", "verkauf", "verkäufer", "kundenberatung", "filiale", "kasse", "beratung"],
  gesundheit: ["fage", "pflege", "gesundheit", "medizin", "praxis", "apotheke", "therapie", "dental", "mpa"],
  soziales: ["fabe", "kinder", "kita", "betreuung", "sozial", "erziehung", "bildung", "pädagog"],
  "handwerk-bau": ["maurer", "zimmermann", "schreiner", "maler", "gipser", "sanitär", "heizung", "dachdecker", "bau"],
  "technik-industrie": ["polymechanik", "mechatronik", "elektro", "automatik", "konstrukteur", "produktion", "maschinen", "labor"],
  "gastro-hotel": ["koch", "köchin", "restaurant", "hotel", "service", "gastro", "bäcker", "konditor", "metzger"],
  logistik: ["logistik", "lager", "transport", "chauffeur", "spedition", "post", "zoll"],
  "finanz-recht": ["bank", "finanz", "versicherung", "treuhand", "buchhaltung", "recht", "immobilien"],
  "gestaltung-medien": ["grafik", "gestaltung", "design", "medien", "polygraf", "fotograf", "marketing", "kommunikation"],
  natur: ["gärtner", "landwirt", "forst", "natur", "umwelt", "tier", "floristik"],
  "sicherheit-oeffentlich": ["polizei", "sicherheit", "verwaltung", "gemeinde", "feuerwehr", "grenzwacht"],
  other: [],
};

const cvCategories: Record<CVType, ApplicationCategory[]> = { developer: ["informatik"], sales: ["detailhandel", "kaufmaennisch"], finance: ["finanz-recht"], other: ["other"] };

export function calculateMatchScore(input: { position: string; category: ApplicationCategory; cvType?: CVType; jobDescription?: string }) {
  const text = `${input.position} ${input.jobDescription ?? ""}`.toLowerCase();
  const categoryTerms = keywords[input.category];
  const matchedTerms = categoryTerms.filter((term) => text.includes(term)).length;
  const keywordScore = categoryTerms.length ? Math.min(35, Math.round((matchedTerms / Math.min(categoryTerms.length, 5)) * 35)) : 15;
  const categoryScore = input.cvType && cvCategories[input.cvType]?.includes(input.category) ? 30 : input.cvType ? 12 : 20;
  const detailScore = input.jobDescription?.trim().length ? 20 : 8;
  const positionScore = input.position.trim().length >= 8 ? 15 : 8;
  return Math.min(100, Math.max(0, keywordScore + categoryScore + detailScore + positionScore));
}
