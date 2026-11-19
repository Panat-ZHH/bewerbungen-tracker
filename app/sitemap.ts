import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo/site.ts";
import type { PublicPath } from "../lib/seo/pages.ts";

/** Date of the last real content change (ISO). Update when the page text changes; legal pages follow LEGAL_STAND in components/legal/docs.ts. */
const SITE_UPDATED = "2026-11-16";
const LEGAL_UPDATED = "2026-11-06";

type Entry = { path: PublicPath; priority: number; changeFrequency: "weekly" | "monthly" | "yearly"; lastModified: string };

/** Public, indexable pages only (each one has an entry in lib/seo/pages.ts). App pages behind the login are excluded (see app/robots.ts). */
export const PUBLIC_PATHS: Entry[] = [
  { path: "/", priority: 1, changeFrequency: "weekly", lastModified: SITE_UPDATED },
  { path: "/schulen", priority: 0.9, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/familien", priority: 0.8, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/preise", priority: 0.9, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/pilot", priority: 0.8, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/anleitung", priority: 0.8, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/hilfe", priority: 0.7, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/datenschutz-uebersicht", priority: 0.6, changeFrequency: "monthly", lastModified: SITE_UPDATED },
  { path: "/datenschutz-schulen", priority: 0.5, changeFrequency: "monthly", lastModified: LEGAL_UPDATED },
  { path: "/datenschutz", priority: 0.4, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
  { path: "/datenschutz-jugend", priority: 0.4, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
  { path: "/avv", priority: 0.3, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
  { path: "/loeschkonzept", priority: 0.3, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
  { path: "/hosting", priority: 0.3, changeFrequency: "yearly", lastModified: LEGAL_UPDATED },
  { path: "/kontakt", priority: 0.5, changeFrequency: "yearly", lastModified: SITE_UPDATED },
  { path: "/impressum", priority: 0.2, changeFrequency: "yearly", lastModified: SITE_UPDATED },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, lastModified: p.lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
