// HTTP security headers for every response (wired in next.config.ts headers()). Pure, so tests/security-headers.test.mjs
// can check them without a build.
//
// CSP without nonces (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces"):
// nonces would force dynamic rendering of every page. Next's inline bootstrap scripts and the theme script in
// app/layout.tsx therefore need 'unsafe-inline' for scripts; everything else is locked down: no foreign script hosts
// except Stripe, no plugins, no <base> hijack, no framing (clickjacking), connections only to the app, Supabase and Stripe.

const STRIPE_SCRIPT = ["https://js.stripe.com", "https://*.js.stripe.com"];
const STRIPE_FRAME = ["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com", "https://checkout.stripe.com"];
const STRIPE_CONNECT = ["https://api.stripe.com", "https://*.stripe.com"];

/** Origin of the Supabase project (https://<ref>.supabase.co) or the wildcard when unknown at build time. */
export function supabaseOrigin(url: string | undefined): string {
  try {
    if (url) return new URL(url).origin;
  } catch {
    /* fall through */
  }
  return "https://*.supabase.co";
}

export function contentSecurityPolicy(opts: { supabaseUrl?: string; dev?: boolean } = {}): string {
  const supa = supabaseOrigin(opts.supabaseUrl);
  const supaWs = supa.replace(/^https:/, "wss:");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : []), ...STRIPE_SCRIPT],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supa, "https://*.stripe.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supa, supaWs, ...STRIPE_CONNECT, ...(opts.dev ? ["ws:"] : [])],
    "frame-src": ["'self'", ...STRIPE_FRAME],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'", "blob:", "data:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://checkout.stripe.com"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: { supabaseUrl?: string; dev?: boolean } = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), payment=(self "https://js.stripe.com")' },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
  ];
}
