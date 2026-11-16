# WendApply als PWA

WendApply lässt sich als App installieren (Android/Chrome/Edge: «App installieren», iOS Safari: Teilen → Zum Home-Bildschirm).

## Bausteine
- `app/manifest.ts` → `/manifest.webmanifest` (Name, Farben = `--paper`, Start `/dashboard?source=pwa`, Icons, Shortcuts, Screenshots).
- `public/icons/*` → erzeugt mit `node scripts/pwa-icons.mjs` aus `app/icon.png` (any 192/512, maskable 192/512 mit Safe-Zone, apple-touch-icon 180, Favicons, schmaler Screenshot).
- `app/layout.tsx` → `appleWebApp`, Icons, `<PwaRegister/>` und `<InstallHint/>`.
- `components/pwa/PwaRegister.tsx` → registriert `/sw.js` (nur Production, lokal mit `NEXT_PUBLIC_PWA_DEV=1`) und zeigt bei neuer Version den Toast «Update verfügbar – neu laden».
- `components/pwa/InstallHint.tsx` → kleines Banner nur auf `/dashboard`, nicht in der installierten App, «Ausblenden» wird in `localStorage` (`wendapply-install-dismissed`) gemerkt.
- `components/pwa/sw-registration.ts` → eine einzige Registrierung, auch für Web Push (`lib/reminders-client.ts`).
- `public/offline.html` → Offline-Seite (hell/dunkel, «Nochmals versuchen»).

## Cache-Strategie (`public/sw.js`)
| Anfrage | Strategie |
|---|---|
| `/_next/static/*` | Cache first (max. 150 Einträge) |
| Bilder/Fonts derselben Domain, `/_next/image` | Cache first (max. 60) |
| Seitenaufrufe (navigate) | Network first → Cache → `/offline.html` (max. 25) |
| Alles andere | **nicht angefasst** |

Nie gecacht/abgefangen: fremde Domains (Supabase `*.supabase.co`, Auth, Functions), `/api/*`, `/auth/*`, Nicht-GET, Range- und RSC-Anfragen, Antworten mit `no-store`/`private`/`Set-Cookie` oder Status ≠ 200. Next liefert dynamische Seiten mit `no-store` aus – diese landen deshalb nie im Cache, offline erscheint dann `offline.html`.

Push (`push`, `notificationclick`) ist unverändert.

## Neue Version ausrollen
1. In `public/sw.js` `SW_VERSION` erhöhen (z. B. `"v1"` → `"v2"`) – nötig, wenn sich Cache-Logik oder vorab gecachte Dateien (Offline-Seite, Icons) ändern.
2. Deployen. Offene Apps zeigen «Update verfügbar – neu laden»; nach Klick übernimmt der neue Worker (`SKIP_WAITING`) und die Seite lädt neu. Alte `wendapply-*`-Caches werden beim Aktivieren gelöscht.
`/sw.js` wird mit `updateViaCache: "none"` registriert, Browser prüfen also immer die aktuelle Datei.

## Tests
- `node --experimental-strip-types --test tests/pwa*.test.mjs` (Routing-/Cache-Regeln, Manifest, Install-Logik).
- Geprüft im Headless-Chrome (Production-Build): Manifest gültig, SW kontrolliert die Seite, Offline-Fallback, keine fremden/API-Einträge in den Caches, `Page.getInstallabilityErrors` leer, Update-Toast. Lighthouse-Bericht: `lighthouse-core.html` (Lighthouse 12 hat keine PWA-Kategorie mehr).
