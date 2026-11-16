import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo/site.ts";

/**
 * Public marketing and legal pages are indexable; the logged-in app and APIs are not (they are also noindex via the root layout).
 * Rules are path prefixes: "/familie/" and "/familie$" block the family app without blocking the public page /familien.
 */
export const DISALLOW = [
  "/api/", "/auth/", "/dashboard", "/applications", "/search", "/map", "/friends", "/classes", "/teacher", "/settings", "/profile",
  "/onboarding", "/cvs", "/analytics", "/invite", "/login", "/bewerbung-check", "/schul-admin", "/familie/", "/familie$",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
