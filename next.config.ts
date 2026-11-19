import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Website aliases (copy deck §1.3): the canonical URLs stay /familien and /schulen; these names only forward permanently.
  async redirects() {
    return [
      { source: "/fuer-eltern", destination: "/familien", permanent: true },
      { source: "/eltern", destination: "/familien", permanent: true },
      { source: "/fuer-schulen", destination: "/schulen", permanent: true },
      { source: "/lehrpersonen", destination: "/schulen", permanent: true },
      { source: "/funktion", destination: "/funktionen", permanent: true },
      { source: "/ueber", destination: "/ueber-uns", permanent: true },
      { source: "/haeufige-fragen", destination: "/faq", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, dev: process.env.NODE_ENV === "development" }),
      },
      // Platform admin: never indexed, never stored by a shared cache (the API sets the same on every answer).
      ...["/admin", "/admin/:path*"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }],
      })),
      // The in-app Stripe Payment Element (iframe on js.stripe.com) loads our Instrument Sans from /fonts: needs CORS.
      { source: "/fonts/:file*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
