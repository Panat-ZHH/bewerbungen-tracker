import type { MetadataRoute } from "next";

/** Public marketing and legal pages are indexable; the logged-in app and APIs are not. */
export const DISALLOW = ["/api/", "/auth/", "/dashboard", "/applications", "/search", "/map", "/friends", "/classes", "/teacher", "/settings", "/profile", "/onboarding", "/cvs", "/analytics", "/invite", "/login", "/bewerbung-check"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: "https://wendapply.ch/sitemap.xml",
    host: "https://wendapply.ch",
  };
}
