# /anleitung – marketing + how-to page

- Route: `app/anleitung/page.tsx` (static, server component). Texts: `components/guide/content.tsx` (labels in «» copied from the UI). Install accordions: `components/guide/install-section.tsx` (native `<details name>`; `platform-open.tsx` is the only client JS and opens the visitor's platform). TOC: `components/guide/toc.tsx`. Screenshots: `public/landing/*` + `public/guide/dorf-light.webp` (cropped from `docs/shop-v2/shots/ruin/1280-1-village.png`).
- Public: there is no `middleware.ts`/`proxy.ts`; auth is per-route client side (layouts of app areas). `/anleitung` has no layout guard, so nothing to add. No `app/sitemap.ts` / `app/robots.ts` exist yet, so nothing was added there.
- SEO: canonical `https://wendapply.ch/anleitung`, OpenGraph/Twitter, FAQPage JSON-LD (answers in `faq` are plain text on purpose).
- Linked from `app/page.tsx` (hero note «So funktioniert’s») and `app/hilfe/page.tsx`.
- Verification 2026-11-16: lint/tsc/tests/build pass; 375/1280 px light+dark without horizontal overflow or console errors; all 23 links resolve. Lighthouse (mobile, local `next start`): Performance 83, Accessibility 100, Best Practices 100, SEO 100 (`lighthouse.html`). The LCP is mostly render delay from the app-wide JS bundle; the landing page `/` scores 79 under the same conditions.
- Known: the landing screenshots (`public/landing/*.webp`) show the older blue design; refresh them when someone re-shoots the landing page.
