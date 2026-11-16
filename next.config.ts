import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The in-app Stripe Payment Element (iframe on js.stripe.com) loads our Instrument Sans from /fonts: needs CORS.
  async headers() {
    return [{ source: "/fonts/:file*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;