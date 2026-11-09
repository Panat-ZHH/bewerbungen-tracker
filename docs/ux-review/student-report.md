# WendApply – Student explorer report (Part A1)

Date: 2026-11-06 · Tester: automated explorer (Playwright / headless Chromium) · Role: student looking for a Lehrstelle

## 0. Setup and limits (read first)

- **Build tested:** the `delete-account` worktree (main as of the Google-login commit plus account deletion), run locally with `next dev --webpack` on port 3377 against the **real PRIVAT Supabase project**. That makes it the same app and data model as production. It is **not** the teacher-role build, so the role picker and teacher flows are out of scope. The sign-up form already shows the role switch "Ich bin Schüler:in / Lehrperson".
- **Viewports:** iPhone 390×844 (touch, mobile UA) and desktop 1440×900. Screenshots are in `student/` (prefix `m-` = mobile, `d-` = desktop). Every referenced file exists.
- **Timings are dev-server timings** (webpack dev, cold route compiles). First page loads of 2–5 s, and the map at 8–9 s, are inflated. Do not read them as production numbers. Only the *relative* search latencies are meaningful, because the search scrapes live sources.
- **What could not be tested, honestly:**
  - **E-mail sign-up end to end.** The first attempt with an `@example.com` address was rejected (`email_address_invalid`). The retry then hit `over_email_send_rate_limit` (HTTP 429), so no confirmation mail was possible (see P0-1). The throwaway account `uxtest-explorer-0611@example.com` was therefore created through the Supabase admin API with a confirmed e-mail, and the rest of the journey ran through the real UI login.
  - **Google login:** only the redirect was verified (click on "Weiter mit Google" → `accounts.google.com`, 2 s, `redirect_uri` = Supabase callback). I did not log in with a real Google account.
  - **Friends:** only a single account was used, so friend requests were not exercised. I saw the empty state, the invite code and the privacy text.
  - **Documents:** I looked at the CV page but did not upload a file.
  - **Real account deletion:** the UI was tested up to the server call, which returns 503 (see section 5). I removed the throwaway user myself afterwards.
- **Throwaway account:** `uxtest-explorer-0611@example.com` (id `0381858b-…`), **deleted** at the end, see section 9.

## 1. The journey, step by step

| Step | Mobile | Desktop | Notes |
|---|---|---|---|
| Open `/` | Redirects to the login page (1.7 s) | same | `m-01-landing.png`. The login page is the landing page: no explanation of what WendApply is. |
| Sign-up form | 1 click "Konto erstellen" | same | `m-02-signup-form.png`. Has a role switch, Google, e-mail, password and a repeat field. Password strength is shown ("Noch zu kurz", "Stark"). |
| Sign-up submit | **fails with generic text**, see P0-1 | | `m-04-signup-submitted.png`: "Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es noch einmal." The real cause was an invalid e-mail domain. |
| Wrong password | clear message: "E-Mail oder Passwort stimmt nicht. Versuch es noch einmal oder setze dein Passwort zurück." | | Good. `m-05-login-wrong-pw.png` |
| Login | 1.4 s → `/dashboard` | | `m-06-after-login.png`. **There is no onboarding at all.** |
| First dashboard | Welcome card "So startest du in drei Schritten" | | Avatar shows **"U0"** (placeholder initials from the e-mail), no name. |
| Search "Informatiker" | type + Enter = **2 actions**. First results in 5.8 s (cold) | 6.6 s | 25 hits (Yousty 14, jobs.ch 11) |
| Filter by Zürich | Filter → Ort → Kanton → "16 Treffer anzeigen" → "Jetzt neu suchen" = **5 clicks** | | see F-3 |
| Save a job | scroll → "Merken" = **1 click** (3 from an empty search page) | | Button turns into "Gemerkt" and the state persists. |
| Add an application by hand | `Bewerbungen` → "Bewerbung hinzufügen" → 2 fields → "Bewerbung speichern" = 2 clicks + 2 text fields (plus "Noch mehr eintragen", date and place = **4 clicks**, 1.8 s) | | Good: only Firma + Stelle are required. |
| Change status | Open the application (1 click) + pick a status (1 select) = **2 actions**, auto-saved with an undo toast | | `m-25-status-Zusage.png` |
| Deadline | "Bewerben bis" in the "more" section; dashboard shows "Bald fällig · in 5 Tagen" | | works, but no notifications (F-8) |
| Map | `Mehr` → `Map` = 2 taps; 8.6 s dev load | | `m-31-map.png`, `d-07-map.png` |
| Dark mode | Settings → "Dunkel" = 2 taps | | looks consistent, no contrast hits (section 7) |
| Delete application | trash icon → confirm sheet "Gleich danach kannst du das Löschen noch rückgängig machen." | | good (undo pattern) |
| Delete account | Settings → "Konto löschen…" → type LÖSCHEN + password | | UI fine, backend not live, see section 5 |

## 2. What works well (keep)

1. **Search is the star.** Yousty and jobs.ch are combined in one search, and results link to the original ad. Live filter counts in the drawer, the filter state in the URL (shareable) and "Wir suchen auch nach: informatik, informatikerin, ict, it, developer" synonym expansion are strong.
2. **Real Lehrstellen.** The result set for "Informatiker" was almost all genuine "Informatiker/in EFZ" Lehrstellen from Swiss employers (LGT, Siemens, Roche, Swiss Post, Universität Zürich, …).
3. **Low-friction tracking.** Only company + position are required, and a good microcopy line explains each status in plain language ("Du arbeitest an Lebenslauf und Anschreiben." / "Du hast eine Zusage bekommen. Gratulation!"). The status select saves immediately with an undo toast.
4. **Tone.** Warm, informal "du", and the friend privacy wording is clear ("Freunde sehen Anzahl und Status, nie Firmen, Notizen oder Gehalt").
5. **The map** (isometric Bewerbungsdorf; each application is a house or construction site, with villagers, coins and a shop) is the only real gamification, and it is visually excellent (`m-31-map.png`). Status feeds it: "Gemerkt" = construction site, "Zusage" = finished house.
6. **Dark mode** is complete and readable (`m-41-dark-search.png`).
7. **Accessibility basics are solid:** `lang="de"`, skip link, exactly one h1 per page, no unnamed controls, no horizontal overflow, 3 px focus outlines, and on mobile **every interactive element is ≥44 px** (the audit found nothing under 44 px except the visually hidden skip link and file inputs).
8. **Account deletion UI is thorough**: it lists what is deleted with real counts and requires the word plus the password (`m-52-delete-account-modal.png`).

## 3. Friction points, bugs and gaps

### 3.1 Sign-up and onboarding

- **F-1 (P0) Sign-up can fail for everybody.** Supabase's built-in mail sender is rate limited (`over_email_send_rate_limit`). I hit it while using only 2 sign-up attempts. If 25 students of one class register in the same lesson, most of them will see a dead end. The UI maps it to "Zu viele Versuche. Warte kurz …" for 429, but a student cannot fix it by waiting (the limit is per hour and project-wide). A custom SMTP provider is required. (Live project setting `mailer_autoconfirm=false`, so confirmation mails are mandatory.)
- **F-2 Generic error for invalid e-mail.** `email_address_invalid` becomes "Das hat nicht geklappt. Bitte prüfe deine Angaben …". A 14-year-old who mistypes `gmial.com` gets no hint about *what* to check.
- **No onboarding.** After the first login the student lands on an empty dashboard. Nobody asks for: school year (7./8./9. Klasse, Sek A/B/C), desired profession, Wohnort/Kanton, when the Lehre should start. So search starts blank every time, the profile stays empty and the first search is not personalised. Typing a profession plus a place is left to the student (see F-4).
- **"U0" avatar / no display name.** The header shows "U0" and the menu shows the raw e-mail. Names are only entered in Profile (`/profile`), which is never suggested.
- **No explanation on the landing page.** A visitor who opens wendapply.ch sees only a login box. There is no one-line pitch ("Finde deine Lehrstelle, behalte alle Bewerbungen im Blick") and no screenshot or example, so a teacher's QR code leads to a cold login form.

### 3.2 Search

- **F-3 (P1) Filter apply is two-step and confusing.** After "16 Treffer anzeigen" the list still shows non-matching hits (Vaduz, Kaiseraugst), the header still says "ganze Schweiz", the badge says "Filter (1)" while two chips (Ort + Kanton) are shown, and a banner says "Suchbereich wurde geändert. Jetzt neu suchen". Only after that second click (about 6–9 s) do all 25 hits become Zürich (`m-12-filtered.png` vs `m-15-after-research.png`). The button promised 16 results that were wrong.
- **F-4 (P1) Free text with a place returns nothing.** "Polymechaniker Winterthur" → **0 hits**, with the message "Yousty: Dieser Lehrberuf wurde nicht gefunden. Nutze einen genauen Beruf …" and a red "Yousty · gerade nicht erreichbar" chip (`m-51-zero-results.png`). Students will type exactly this. "Lehre Informatik 2027" returned only 1 hit. The error wording blames the student and the red chip looks like an outage.
- **F-5 Results are capped at 25** per query/source mix ("25 Treffer" for Informatiker, Kauffrau, Fachmann Gesundheit, Mediamatiker, Coiffeur, Automobil: always exactly 25). There is no "mehr laden". A student cannot know that there may be hundreds more Lehrstellen.
- **F-6 Result cards carry too little Lehrstelle-specific information.** There is a title, company, place, "Lehrstelle" and source. Missing for a Lehrstellensuche: start year (shown for only 3–5 of 25 hits), application deadline, Schnupperlehre possibility, school-level requirements (Sek A/B, Multicheck), distance from home or public-transport time, and a Zusage rate. Detailhandel, Mediamatiker and Coiffeur returned 0 hits with a start date.
- **F-7 Card layout:** each card is ~300 px tall on mobile, so 25 hits are a 6,700 px scroll (`m-09b-search-results-full.png`). The primary button is "Originalanzeige öffnen" (leaves the app), while "Merken" is a secondary, low-contrast button, which is the opposite of what the product needs (saving). The "Merken" button is off-screen for the first card on a 390×844 phone (`m-09-search-results.png`).
- Autocomplete suggestion list overlaps the "Suchen" button while typing (`m-08a-…png`). A tap on "Suchen" can select the suggestion instead (Playwright could not click it for 30 s). Pressing Enter works.
- The search tip "Drücke „/", um schnell ins Suchfeld zu springen" is shown on phones, where there is no keyboard.
- Filters are adult-job oriented: salary input ("z. B. 70000"), "Freelance / Mandat", "Remote", "Universität / ETH", "Letzte 24 Stunden". Missing: Berufsfeld presets that match how a student thinks ("etwas mit Computern", "mit Menschen arbeiten"), Schnupperlehre, Anforderungen (Sek A/B), "öffentlicher Verkehr".
- Liechtenstein employers (Vaduz, Bendern) appear in Swiss results with no canton.
- **Latency:** 5–17 s per search (dev server, live scraping). Even if production is faster, plan for a visible skeleton and per-source progress. During the wait there is only the button spinner.

### 3.3 Tracking applications

- **F-8 (P1) Reminders do not exist.** A deadline is only visible in the dashboard's "Bald fällig" card and on the application. There is no push notification, no e-mail, no calendar export (.ics) and no Settings toggle for notifications. Nothing pulls a student back, and Oberstufe students do not open apps that do not talk to them.
- **F-9 Deadlines are manual.** Search hits do not bring in a deadline, a start year or a description, so "Merken" creates an almost empty record (company, title, place, link, source). The student must retype everything that the scraper already knew.
- **F-10 Status model is adult / corporate:** "Gemerkt – In Vorbereitung – Abgeschickt – Gespräch – Weiteres Gespräch – Zusage – Abgelehnt – Zurückgezogen". There is no **Schnupperlehre** (the single most important step in a Swiss Lehrstellensuche), no **Eignungstest / Multicheck / Basic-Check**, no **Absage erhalten** vs. "Abgelehnt" (reads like the student rejected), and no "Vertrag unterschrieben".
- **F-11 Misleading button label.** On the detail page the status dropdown (auto-saves) sits next to a button called **"Ändern"**, which does not apply the status but opens the full edit form (`m-27-edit-page.png`). My own script, and probably students, assumed "select + Ändern". The trash icon is unlabeled on desktop.
- **F-12 The detail page is thin.** It shows title, company, place, status and deadline (`d-06-detail.png`), but notes, contact person, documents and timeline are not visible (notes only inside the edit form, although the delete dialog promises "Notizen, Kontakten, Fristen und Verlauf"). A Zusage still shows the expired "Bewerben bis 11.11.2026". There is no "Gespräch am …" date and no "Abgeschickt am …" date.
- **F-13 Manual form uses adult wording and fields:** Berufsfeld chips are **Software, Vertrieb, Wirtschaft, Finanzen, Bank, Beratung, Anderes** (different from the 13 search categories); "LOHN: Mindestlohn / Höchstlohn pro Jahr, Währung CHF" (Lehrlingslöhne are fixed per year, so this is noise and may feel odd for 15-year-olds); placeholders are "Migros" and "Mediamatiker:in" (good). The "Was ist in der Stellenanzeige wichtig?" textarea is fine.
- Dashboard counts: "Offen · Noch in Arbeit" counts *Gemerkt* as open, while the "Gespräche" tile says "Noch keine". After a Zusage the tile shows "1 Zusage" as a tiny sub-label instead of a celebration.

### 3.4 Documents, profile

- **F-14 (P1) CV page is built for career changers.** Three fixed slots: "Lebenslauf für Technik – Softwareentwicklung", "… für Vertrieb – Business Development / Vertrieb", "… für Finanzen – Finanzen / Banking" (`d-08-cvs.png`). A 15-year-old needs: **Lebenslauf, Motivationsschreiben, Zeugnisse (Zwischenzeugnis), Schnupperlehre-Bestätigung, Foto**, with the option to add one per application. Documents cannot be attached to an application at all. The delete dialog counts the 3 empty slots as "3 Dokumente (…inklusive der hochgeladenen Dateien)", which is misleading.
- **Profile** fields: Vorname, Nachname, E-Mail, Telefon, Wohnort, **Webseite, LinkedIn** (irrelevant for this age group). Missing: school, class, desired profession, Geburtsdatum is not needed. Placeholder `name@mail.de` in the friend field uses a German domain.

### 3.5 Social, classes, map

- **F-15 Classes are buried.** `Klassen` (where the student enters the teacher's class code) is under `Mehr` on phones, so one extra tap, and nothing tells a student who arrived through a teacher's code where to go. On desktop it is the last nav item. The page text "Was Deine Lehrperson sieht" has a capital "Deine" mid-sentence in the heading list, and the exact same hard-to-spot capitalization appears in "Was Deine Freunde sieht".
- **Friends** page: clear, but the first view is a code wall (code, URL, 3 copy buttons, add form, privacy list) before the actually motivating part (friends' progress). "Per E-Mail" invites a minor to share their e-mail; WhatsApp/AirDrop/QR is how 14-year-olds share.
- **Map:** hidden behind `Mehr → Map` on phones even though it is the product's emotional core. Page title is the English word "Map". Controls are icon-only (anchor "Heimatinsel 100/600", search, coin counter "100", shop bag, "+") with no explanation of what "100/600" or the coin count means, or what to do next. The drag hint uses German-Germany spelling **"Straßen"** (Swiss spelling is "Strassen"). On mobile the dev load took 8.6 s, and WebGL logs "GPU stall due to ReadPixels" warnings (performance).
- **Analytics** ("Auswertung") page: nice concept, but in dev took 9.8 s, the status chart legend shows "WeiteresGespräch" (missing space) in the graph labels, and with one application it says "RÜCKMELDUNGEN 0 – 0 % deiner Bewerbungen".

### 3.6 Settings, account

- The settings page has only Darstellung, Daten sichern, Daten löschen, Konto löschen. There are no notification, language, privacy-consent, or "Passwort ändern" options.
- Two destructive blocks side by side ("Meine Daten löschen" and "Konto löschen…") with similar text and the same red button.
- **Document title is identical on every page** ("WendApply | Bewerbungen einfach im Blick"), which hurts browser-history/tab orientation and screen-reader navigation.
- On desktop the primary nav items are 36 px high (fine for mouse and WCAG 2.2 target-size minimum 24 px, but under the 44 px used on phones).
- The detail URL contains the user id (`/applications/<userId>-app-<timestamp>`), which is harmless in this app but is a privacy smell when students share links or screenshots.

### 3.7 German wording quality

Mostly good, informal and warm. Issues:
- Swiss spelling: "Straßen" → "Strassen" (map hints, `lib/map-drag.ts`: "Straßen und Brücken sind fest …").
- "Map" and "Shop" are English in a German-only UI; "Heimatinsel", "Bewerbungsdorf" are on-brand.
- Mixed capitalization: "Was Deine Freunde sieht" (heading), "Was Deine Lehrperson sieht".
- "Abgelehnt", "Zurückgezogen", "Gemerkt" are fine but should be paired with Lehrstelle-specific statuses (F-10).
- "Offen / Noch in Arbeit", "Gespräche / Noch keine" tiles are ambiguous.
- "Yousty: Dieser Lehrberuf wurde nicht gefunden. Nutze einen genauen Beruf …" sounds like the student made an error (see F-4).
- "Das hat nicht geklappt." is used for several different errors.
- Friend placeholder uses `name@mail.de` (not Swiss).

## 4. How it feels for a 14–16 year old Swiss Oberstufe student

- **Motivation:** the app is calm, tidy and adult. The warm tone and the map are good, but the first 10 minutes contain no reward, no goal, no streak and no "next step" that is specific ("Schicke bis Freitag 2 Bewerbungen ab"). The dashboard sentence "Ein guter nächster Schritt reicht für heute." is nice but not actionable.
- **Gamification is isolated.** The map coins (100 at start, shop, 100/600 capacity) are visible, but the main flows (search, status change, adding a deadline) give no feedback: no confetti, no coins message or progress bar at the moment you save a job or change a status to Zusage. A Zusage is only a toast and a text line (`m-25-status-Zusage.png`).
- **Clarity:** search and tracking are easy to grasp. Nothing teaches the *Lehrstellen process* (Schnupperlehre → Bewerbung → Eignungstest → Gespräch → Zusage by Oct–Dec for the next August), so the app assumes the student already knows how Swiss apprenticeship hiring works.
- **Peer pressure and sharing** are the best motivation for this age; friends exist, but the invite is e-mail/code-based, and there is no leaderboard-style (opt-in) comparison and no class-level view for students.
- **Mobile first is correct** (all taps ≥44 px, bottom navigation, bottom sheets), and the phone experience is the better of the two.

## 5. Account deletion (branch `delete-account`)

- **Settings → "Konto löschen…"** opens a bottom sheet that lists exactly what is removed (live counts: 2 applications, 3 "documents", profile, map, friendships, login). To confirm, the student types `LÖSCHEN` (or their e-mail) and the password. The button is disabled until both are filled (`m-52-delete-account-modal.png`). Good design.
- **Result with the current environment:** after submit the server route `/api/account/delete` answers **503**, and the UI shows: "Das Löschen ist auf diesem Server noch nicht eingerichtet. Bitte melde dich beim Support." (`m-53-delete-result.png`). Reasons visible from the repo and the live DB:
  - migration `20261108000000_account_deletion.sql` is **not applied** to the live project (`supabase migration list`: remote empty for that version), and
  - there is no service-role env var configured for this app on this server.
- The error message appears at the bottom of a scrolling sheet, below the visible form on a 390×844 phone, so the user might not see why nothing happened. There is also no support address or link in that message.
- **Consequence:** as long as this branch is not shipped, there is no self-service way for a minor (or their parent) to delete the account. That conflicts with the data-protection promise on the login page ("Deine Daten bleiben in deinem persönlichen Konto") and is a risk for a school rollout.
- **Database cascade is verified:** I deleted the throwaway user through the admin API; afterwards `auth.users`, `applications` and `profiles` had 0 rows for that id (no orphans in the tables I checked).

## 6. Performance observations (dev server; treat as upper bounds)

- Route first loads: login 1.7 s, dashboard 2–5 s, search page 2.6 s, application detail 4.1 s, analytics 9.9 s, map 8.6 s, classes 5.7 s.
- Search API: 5.1–17 s (live scraping of Yousty and jobs.ch); "Informatiker" cold 5.1 s, "Kauffrau" 15.4 s, "Informatik" (Praktikum) 17.2 s. Filter re-search ≈ 6–9 s.
- 25-hit mobile list renders as a 6,747 px page with no virtualisation (smooth in the test, but long).
- Console: no JS errors on any page, only the expected 400/429 auth responses and WebGL "GPU stall" warnings on the map.
- Recommendation: measure the same flows on the deployed preview before judging; but the scraping latency is structural, so cache popular professions (Informatiker, Kaufmann, FaGe, Detailhandel …) server-side.

## 7. Accessibility

- Contrast: automatic check of text vs background on the new-application page in dark mode found **no pair under 4.5:1**; light theme looked fine visually. (A rough script, not a full axe audit; I did not run axe.)
- Focus: 3 px solid outline on all tested stops; keyboard tab order starts with the skip link and then **11 nav stops** before the page content on desktop.
- Labels: every visible control has an accessible name (0 unnamed). Icon-only buttons (trash on detail page, map controls) have aria-labels.
- Targets: mobile OK (≥44 px); desktop nav and filter chips are 36 px.
- Missing: unique page titles (section 3.6); live-region announcement for the search result count and filter changes was not verified (unsicher).
- Reduced motion and screen-reader behaviour of the map canvas were not tested.

## 8. Verdict: does it REALLY help a student find a Lehrstelle?

**Partly, and today mainly as a good bookmark list with a very good search in front of it.**

- **Core value (what really works):** one search across Yousty and jobs.ch with sensible synonyms and filters, one tap to keep a hit, and a tidy status tracker with friendly copy and a motivating map. That is better than a notes app or an Excel sheet, and better than opening 5 portals.
- **What a student still must do alone:** know the exact profession name, retype data the app already had, remember deadlines, keep Schnupperlehren and tests in some other place, and attach documents elsewhere. The app does not yet know the Lehrstellen *process* or the student.
- **What would make it indispensable:**
  1. **Onboarding with school year + wish professions + Kanton/Wohnort + start year**, then a daily "Neue Lehrstellen für dich" list and push/e-mail alerts.
  2. A **Lehrstellen-specific pipeline** (Schnupperlehre → Bewerbung → Eignungstest → Gespräch → Zusage/Absage) with dates, reminders and a checklist per application (Lebenslauf, Motivationsschreiben, Zeugnisse).
  3. **Reminders** that reach the student (push/e-mail/WhatsApp-style, plus .ics export) and a clear weekly goal with map rewards ("1 Bewerbung abgeschickt = +50 Münzen").
  4. **Class connection**: teacher sees the progress, student sees the class goal, and a QR/code joins directly after sign-up.
  5. Better **search coverage** (more than 25 hits, free text with place, Schnupperlehre listings, deadline and start year on the card).
- **Biggest risk:** *sign-up and first impression at a school launch.* If 20+ students sign up in one lesson, the shared mail rate limit blocks most of them (P0-1), and those who get in see an empty dashboard with no onboarding and generic "Lebenslauf für Technik / Vertrieb / Finanzen" slots. A teacher who tries it once in class and sees it fail will not give it a second chance. The second risk is **no working account deletion** for minors (section 5).

## 9. Fix list

Effort: S = ≤½ day, M = 1–3 days, L = more than 3 days.

### P0 (before any school rollout)

| # | Fix | Effort |
|---|---|---|
| P0-1 | Configure **custom SMTP** (e.g. Resend/Brevo/Postmark with wendapply.ch domain) in Supabase Auth, raise the rate limits, and show a specific message for `email_address_invalid` and 429 ("Bitte prüfe die E-Mail-Adresse, z. B. name@gmail.com" / "Zu viele Anmeldungen, wir versuchen es später automatisch") | S–M |
| P0-2 | Ship **account deletion**: apply migration `20261108000000`, set the service-role env var on Netlify, add a support contact to the 503 text and scroll the error into view | S–M |
| P0-3 | **Onboarding** (3 screens max): name, school year/level, wish professions, Kanton/Wohnort, start year → pre-fill search and profile; short value-prop on the login page ("Finde deine Lehrstelle") | M |
| P0-4 | **Lehrstellen statuses/steps**: add Schnupperlehre, Eignungstest/Multicheck, "Absage erhalten", "Vertrag unterschrieben"; separate dates ("Gespräch am", "Abgeschickt am"); hide "Bewerben bis" after Zusage/Absage | M |

### P1 (first month)

| # | Fix | Effort |
|---|---|---|
| P1-1 | **Reminders**: web push/e-mail for deadlines and "kein Update seit 14 Tagen", .ics export, Settings toggles | M–L |
| P1-2 | Filter apply: re-search automatically (or label the button "Neu suchen mit Filtern"), remove the stale list and the wrong "16 Treffer" promise, fix "Filter (1)" badge count | S–M |
| P1-3 | Search with free text containing a place ("Polymechaniker Winterthur"): parse place, softer errors ("Wir haben dazu nichts gefunden – meintest du …?"), no red "nicht erreichbar" chip unless really an outage | M |
| P1-4 | "Mehr laden" / pagination beyond 25 hits, plus server-side cache of popular professions | M |
| P1-5 | Enrich result cards: start year, deadline, Schnupperlehre, distance/ÖV; make "Merken" the primary action and import deadline/start/description into the saved application | M |
| P1-6 | **Documents for students**: Lebenslauf, Motivationsschreiben, Zeugnisse, Foto, per-application attachments; fix "3 Dokumente" count | M |
| P1-7 | Move **Map** and **Klassen** into the mobile tab bar or Start page (e.g. replace one tab or add a map card on the dashboard); name the map page "Dorf" instead of "Map" | S–M |
| P1-8 | Give **immediate rewards** for core actions (save a job, send an application, interview, Zusage: confetti/coins/progress bar) and a weekly goal on the dashboard | M |
| P1-9 | Rename "Ändern" to "Bearbeiten" and separate it from the status select; add a text label to the trash action; show notes, contact and timeline on the detail page | S–M |

### P2 (polish)

| # | Fix | Effort |
|---|---|---|
| P2-1 | Unique `<title>` per page | S |
| P2-2 | Swiss spelling ("Strassen"), "Map/Shop" → German, "Was Deine Freunde sieht" capitalisation, Swiss placeholder `name@gmail.com`, "WeiteresGespräch" label in analytics | S |
| P2-3 | Replace adult fields (Lohn, Webseite, LinkedIn, Berufsfeld "Software/Vertrieb/Bank") with student-relevant ones; align the manual Berufsfeld list with the 13 search categories | S–M |
| P2-4 | Hide the "/" keyboard tip on touch devices; make the autocomplete list not cover the "Suchen" button | S |
| P2-5 | Avatar initials from the name (not "U0") and prompt for the name after first login | S |
| P2-6 | Friends: share via WhatsApp/QR/AirDrop instead of "Per E-Mail"; show friends' motivation first, code second | S–M |
| P2-7 | Compact result cards (≈150 px) with a list/compact toggle; remove the user id from the application URL | S–M |
| P2-8 | Add a settings section for notifications, password change and a clearer split of "Meine Daten löschen" vs "Konto löschen" | S |
| P2-9 | Desktop nav and filter chips to 44 px; fewer tab stops before content (landmark navigation) | S |
| P2-10 | Run a full axe audit in both themes and test reduced motion and screen-reader behaviour of the map (not done here) | S–M |

## 10. Clean-up

- The throwaway account `uxtest-explorer-0611@example.com` (id `0381858b-b75a-47ac-ac2c-67383d4a1efd`) was **deleted** through the admin API after testing. Checks: 0 rows left in `auth.users`, `applications` and `profiles` for that id. Its 2 test applications ("LGT Bank AG" saved from search, "Zürcher Kantonalbank (Test)") went with it.
- Other test users on the project (`uxtest-teacher-0611`, `uxtest-s1/s2/s3-0611@example.com`, created by other helpers) were **not touched**.
- No production deploys, no pushes, no e-mails or messages were sent. The local dev server on port 3377 was stopped. The only repo changes are the new files under `docs/ux-review/`.
- The Playwright scripts used for the run are in `/tmp/uxs/` (not part of the repo).
