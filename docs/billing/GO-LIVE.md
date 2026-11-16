# Stripe Go-Live – Checkliste für Panat

Stand: 2026-11-16 · Branch `feature/stripe` (nicht gepusht) · alles bisher nur im **Stripe-Testmodus** (Sandbox `acct_1UcSQNJBozPvqHEJ`).
Der Code ist fertig und getestet, **aber hinter einem Flag ausgeschaltet**. Solange `STRIPE_ENABLED` nicht `true` ist, sieht wendapply.ch genau so aus wie heute („WendApply ist aktuell kostenlos. Online-Bezahlung folgt.“), und alle Billing-Routen antworten mit `503 billing_disabled`.

> Reihenfolge einhalten. Jeder Schritt mit ⚠️ braucht Panats ausdrückliche Freigabe, weil er live, kostenpflichtig oder schwer rückgängig zu machen ist.

## 0. Entscheidungen vorab

| Thema | Stand | Was zu tun ist |
|---|---|---|
| **Familienpreis** | Erledigt 2026-11-16: **CHF 7.90 pro Monat oder CHF 79 pro Jahr** in `lib/billing/plans.ts`, Stripe-Testmodus hat beide Preise (`wendapply_family_monthly_chf`, `wendapply_family_yearly_chf`), CHF-49-Platzhalter archiviert. | – |
| **MWST** | Entschieden 2026-11-16 (Panat): **keine MWST** – WendApply/Wendico ist nicht MWST-registriert. `BILLING.vatRegistered = false`, nirgends „inkl./exkl. MWST“ (UI, Texte, Stripe-Produktbeschreibungen), Preise einfach „CHF 7.90 pro Monat“ / „CHF 79 pro Jahr“ / „CHF 990 pro Jahr“. Keine Stripe Tax, kein `automatic_tax`, neue Live-Preise ohne `tax_behavior`. Impressum: „Nicht mehrwertsteuerpflichtig“. | Erst wieder relevant ab Umsatz > CHF 100'000 (MWST-Pflicht): dann MWST-Nummer, Texte und Stripe-Steuer anpassen (Code-Änderung). |
| **Stripe „Managed Payments“** | Entschieden 2026-11-16: bleibt **AUS** (`managed_payments.enabled=false` pro Checkout), WendApply verkauft selbst. | – |
| **QR-Rechnung** | Rechnungszahlung (Schulen) läuft über Stripe Invoicing, 30 Tage Zahlungsfrist. QR-Rechnung wird nicht erzwungen. | Im Dashboard unter *Settings → Payment methods* / *Invoice template* prüfen, ob Swiss QR-bill bzw. Banküberweisung für das Konto verfügbar ist, und aktivieren. |

## 1. Stripe-Konto aktivieren ⚠️

1. Dashboard → *Activate payments*: Firma (Wendico), Adresse, UID/Handelsregister, Vertretungsberechtigte Person, **Bankkonto (CH-IBAN)** für Auszahlungen.
2. *Settings → Business → Public details*: Name „WendApply“, Support-E-Mail, Website `https://wendapply.ch`, Statement descriptor (z. B. `WENDAPPLY`).
3. *Settings → Billing → Subscriptions and emails*: Kunden-E-Mails für Rechnungen/Belege an, Mahnwesen (Smart Retries, nach X Tagen kündigen) festlegen.
4. *Settings → Billing → Customer portal*: Kündigen erlauben (zum Periodenende), Rechnungen ansehen, Zahlungsmethode ändern. Planwechsel nur, wenn gewünscht. Optional die Konfigurations-ID als `STRIPE_PORTAL_CONFIGURATION_ID` setzen.

## 2. Produkte & Preise im Live-Modus anlegen ⚠️

> **Stand 2026-11-17:** Stripe-Konto `acct_1UcSQ3JAaBKruAMr` ist **aktiviert** (charges/payouts enabled, Name „Wendapply“, Descriptor `WENDAPPLY`), noch **keine** Live-Produkte, -Webhooks oder -Portal-Konfiguration. Schritte 2–4 erledigt in einem Lauf (von Panat freigegeben):
> `node --experimental-strip-types scripts/stripe/live-setup.mjs --wait 15` – liest den Live-Key **nur aus der Zwischenablage** (sk_live_/rk_live_), legt Produkte/Preise + Portal an, setzt `STRIPE_SECRET_KEY` (secret), `STRIPE_PORTAL_CONFIGURATION_ID`, erstellt den Webhook (6 Events, API `2026-10-28.endive`) und setzt `STRIPE_WEBHOOK_SECRET` (secret) – alles nur Netlify-Kontext *production*, Flags bleiben AUS. `--check` = nur lesen/prüfen.

Das gleiche Skript wie im Test, nur mit einem Live-Key (es ist idempotent, findet Produkte über `metadata.plan_id` und Preise über `lookup_key`):

```bash
# im Repo; Live-Key NUR für diesen Aufruf in der Shell setzen (nicht in Dateien, nicht ins Terminal-Log kopieren).
# Ohne Key nutzt das Skript die eingeloggte Stripe-CLI im Live-Modus.
STRIPE_ALLOW_LIVE=yes STRIPE_LIVE_SECRET_KEY=<live key aus dem Dashboard> node scripts/stripe/setup-products.mjs --live
```

Ein Plan mit `placeholder: true` wird im Live-Modus übersprungen. Danach im Dashboard kontrollieren: 3 Schulprodukte (Starter CHF 990, Professional CHF 1'490, Enterprise CHF 3'990 pro Jahr) und das Familienprodukt mit dem **finalen** Preis. Details: `docs/billing/CATALOG.md`.

## 3. Live-Keys in Netlify (nur Production-Kontext) ⚠️

Im Dashboard *Developers → API keys* einen **Restricted Key** (oder den Secret Key) erzeugen. Dann:

```bash
netlify env:set STRIPE_SECRET_KEY "<live key>" --context production --secret
netlify env:set SUPABASE_SERVICE_ROLE_KEY "<falls noch nicht gesetzt>" --context production --secret
```

- `STRIPE_ACCOUNT_ID` **nicht** setzen (nur für lokale Tests mit dem CLI-Token).
- `BILLING_DB` **nicht** setzen (`memory` wird in Production ohnehin verweigert).
- Optional `APP_URL=https://wendapply.ch` (sonst wird die Netlify-`URL` verwendet).

## 4. Live-Webhook ⚠️

Dashboard → *Developers → Webhooks → Add endpoint*:
- URL: `https://wendapply.ch/api/stripe/webhook`
- Events (genau diese 6): `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Signing secret kopieren → `netlify env:set STRIPE_WEBHOOK_SECRET "<whsec…>" --context production --secret`

## 5. Datenbank-Migration auf Live-Supabase ⚠️ (vorher Backup!)

> **Stand 2026-11-16 (geprüft):** Die Migration ist auf Live **bereits angewendet** (`migration list`: alle 27 lokal = remote, `db push --dry-run`: „Remote database is up to date“). Live hat 0 Lizenzen, 0 Billing-Kunden/-Abos und 18 verarbeitete `stripe_events` aus den Testmodus-E2E-Läufen (die Preview nutzte die Live-DB). Backup (Schema, Daten, Rollen, sha256) liegt in `~/JARVIS/workspace/backups/wendapply-2026-11-16/` inkl. `migration-impact.md`. Schritt 5 entfällt also; die Punkte unten gelten für künftige Migrationen.

Migration: `supabase/migrations/20261116200000_billing_stripe.sql` (neue Tabellen `billing_customers`, `billing_subscriptions`, `stripe_events`; `school_licences` bekommt `source`, `stripe_subscription_id`, `valid_until`; RLS; Funktionen `billing_apply_subscription`, `billing_status_for_school/_family`). Bestehende manuelle Lizenzen und der Schülerlimit-Trigger bleiben unverändert.

1. Backup: Supabase Dashboard → Projekt `bhwreehwirrloxagyypi` → *Database → Backups* (oder `supabase db dump --linked -f backup-2026-xx-xx.sql`).
2. Migration anwenden (`supabase db push --linked`, Konto PRIVAT).
3. Kontrolle: `select count(*) from school_licences where source is null;` → 0; bestehende Lizenzen haben `source = 'manual'`/`'pilot'`.

**Die Migration muss live sein, bevor das Flag eingeschaltet wird** (sonst antwortet der Webhook mit 500; Stripe wiederholt dann bis zu 3 Tage, es geht nichts verloren).

## 6. Code live bringen ⚠️

`feature/stripe` → Pull Request → `main` (main deployt wendapply.ch). Mit Flag AUS ist das ohne sichtbare Änderung – gut, um zuerst nur den Code live zu haben.

## 7. Flag umschalten ⚠️

```bash
netlify env:set STRIPE_ENABLED true --context production
netlify env:set NEXT_PUBLIC_STRIPE_ENABLED true --context production
```
`NEXT_PUBLIC_…` wird beim Build eingebaut → danach **neu deployen** (Netlify *Trigger deploy*).

## 8. Eine echte Zahlung testen

1. Als Schul-Admin einer eigenen Test-Schule `/schul-admin` → *Abo & Rechnung* → Starter → Karte → mit eigener Karte zahlen.
2. Prüfen: Stripe-Dashboard zeigt Zahlung + Abo; Webhook-Endpoint zeigt 200er; in Supabase `billing_subscriptions` 1 Zeile, `school_licences` mit `source='stripe'`, `status='active'`, `student_limit=100`.
3. *Abo verwalten* (Portal) öffnen → kündigen → danach im Dashboard erstatten (Refund).

## Rollback

- **Sofort:** `STRIPE_ENABLED=false` und `NEXT_PUBLIC_STRIPE_ENABLED=false` (production) + neu deployen → Seite wie heute, alle Billing-Routen 503. Laufende Abos bleiben in Stripe bestehen; Stripe-Webhooks erhalten 503 und werden wiederholt, sobald das Flag wieder an ist.
- **Code:** Merge-Commit auf `main` per `git revert` zurücknehmen und deployen.
- **Datenbank:** Die Migration nicht zurückrollen, solange es echte Abos gibt (die Tabellen schaden ausgeschaltet nicht). Im Notfall: Backup aus Schritt 5 einspielen.
- **Stripe:** Webhook-Endpoint deaktivieren; Abos im Dashboard kündigen/erstatten.

---

## English summary

Everything is built and tested in Stripe **test mode** on branch `feature/stripe` (not pushed). It is switched **off** by the `STRIPE_ENABLED` / `NEXT_PUBLIC_STRIPE_ENABLED` flags, so the live site is unchanged. To go live, in this order and each with Panat's approval: (0) decisions made 2026-11-16: family CHF 7.90/month or CHF 79/year, no VAT (not MWST-registered, no VAT wording anywhere), Managed Payments stays off; (1) activate the Stripe account with business and bank details; (2) run `STRIPE_ALLOW_LIVE=yes STRIPE_LIVE_SECRET_KEY=… node scripts/stripe/setup-products.mjs --live`; (3) put the live key into Netlify **production** env only; (4) create the live webhook `https://wendapply.ch/api/stripe/webhook` (6 events) and store its secret; (5) back up the live Supabase DB, then apply migration `20261116200000_billing_stripe.sql`; (6) merge `feature/stripe` into `main`; (7) flip both flags and redeploy; (8) make one real payment and refund it. Rollback: set the flags back to false and redeploy.
