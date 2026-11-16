# Familien: public site (branch fam-site)

## Built
- `app/familien/page.tsx`: new public page /familien (hero, Jugendliche, Eltern, Familienpaket with price placeholder "Preis folgt – noch nicht festgelegt", 4 steps Registrieren / Kind einladen / Einwilligung / Fortschritt sehen, Datenschutz für Minderjährige (DSG, DSGVO Art. 8, Datenminimierung, Einwilligung unter 16, Kind entscheidet, Export/Löschung, keine Werbung), FAQ, Warteliste).
- `components/public/waitlist-form.tsx`: client form, calls only RPC `waitlist_join(p_email, p_kind='family', p_message)`. Supabase client is imported lazily on submit, so the page is static and renders without the family migrations. Any error (e.g. RPC not deployed yet) shows a mailto fallback. Role (Elternteil / Jugendliche:r) is prefixed to p_message, e.g. `[Elternteil] …`.
- `components/public/marketing.ts`: `FAMILY` (seats 1+1, `pricePerYear: null`, placeholder), `WAITLIST_KIND_FAMILY`, `MAIL_FAMILY`.
- Navigation + footer (`public-shell.tsx`), sitemap (`/familien`), Preise (family block + FAQ), Hilfe (new group `#familien`).
- Tests: `tests/fam-site.test.mjs`; screenshots/axe/overflow: `tests/fam-site-shots.mjs` -> `docs/family/shots/`.

## Not changed
- `public/sw.js` precache list only holds the offline page and icons (pages are network-first cached at runtime), so /familien is not added there; it is cached like every other page after the first visit.

## Open questions
- p_kind value: site sends `family`. The DB part must accept it (or tell us the allowed values).
- Price of the Familienpaket: intentionally not set.
- Waitlist privacy: the waitlist (e-mail + message) should be mentioned in the Datenschutzerklärung before go-live.
