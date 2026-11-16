import type { MetadataRoute } from "next";

const BASE = "https://wendapply.ch";

/** Public, indexable pages only. App pages behind the login are excluded (see app/robots.ts). */
export const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/schulen", priority: 0.9, changeFrequency: "monthly" },
  { path: "/preise", priority: 0.9, changeFrequency: "monthly" },
  { path: "/pilot", priority: 0.8, changeFrequency: "monthly" },
  { path: "/anleitung", priority: 0.8, changeFrequency: "monthly" },
  { path: "/hilfe", priority: 0.7, changeFrequency: "monthly" },
  { path: "/datenschutz-uebersicht", priority: 0.6, changeFrequency: "monthly" },
  { path: "/datenschutz-schulen", priority: 0.5, changeFrequency: "monthly" },
  { path: "/datenschutz", priority: 0.4, changeFrequency: "yearly" },
  { path: "/datenschutz-jugend", priority: 0.4, changeFrequency: "yearly" },
  { path: "/avv", priority: 0.3, changeFrequency: "yearly" },
  { path: "/loeschkonzept", priority: 0.3, changeFrequency: "yearly" },
  { path: "/hosting", priority: 0.3, changeFrequency: "yearly" },
  { path: "/kontakt", priority: 0.5, changeFrequency: "yearly" },
  { path: "/impressum", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((p) => ({ url: `${BASE}${p.path === "/" ? "" : p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
