# WendApply – Teacher review (Part A2)

Date: 2026-11-06 · Branch `teacher-role` (commit 6e9ef0b), run locally (`next dev --webpack`, port 3347) against the real PRIVAT Supabase project. The migration `20261107000000_teacher_role.sql` is already applied there.
Method: Playwright with Chrome, desktop 1280×800 and iPhone 390×844 @2x. Throwaway accounts: 1 teacher and 3 students (`uxtest-*-0611@example.com`). They were created with the admin API, so they had no role metadata. That is the Google-login path, which is why every account saw the role picker first.
Screenshots: `teacher/*.png` (41 files, numbered in walk order). Timings come from the dev server (webpack, uncached) and are only indicative.

**Not tested** (be aware of it when reading the conclusions):
- Nudge ("Inaktive erinnern"): no student was inactive, so the button stayed at 0.
- Co-teacher flow, archiving, regenerating the code, removing a student.
- Revoking an invite.
- A real e-mail signup with a confirmation mail. I also did not see how a student who is already a member behaves with a foreign personal link.
- axe-core only ran on the dashboard in dark mode (0 violations). Everything else is manual.

---

## 1. Walk-through with click counts

| Flow | Steps / clicks | Verdict |
|---|---|---|
| Teacher login → first class | Login (2 inputs + 1 click) → role picker (2 clicks) → onboarding step 1 "Rolle" **asks the role again** (1 click) → name (1 input + 1 click) → class name + year (1 input + 1 click) → code screen. About **8 clicks, 3 inputs, 4 screens**. | Works. The role question is asked twice (`auth/role` and onboarding step 1). The code plus "Kopieren/Teilen" shows right after class creation, which is good. |
| Create a further class | Dashboard → "Klasse erstellen" modal → name → "Erstellen" = 3 clicks + 1 input. | Good. |
| Invite by code or link | Class → tab "Einladen": code and link are visible at once (1 click). | Very good. |
| Invite by e-mail | Paste addresses → "Einladungen erstellen" → "Alle Links kopieren". | **No mail is sent.** The teacher must copy the personal links and send them themselves (Outlook/Teams). The result list shows only the valid addresses. The invalid entry `kaputt-adresse` and the duplicate were dropped **silently, with no message**. |
| Student joins via personal link (logged out) | Link → login page (invite context lost) → 3 actions → role picker (2 clicks) → consent screen → 1 click = **about 6 actions, 3 screens**. | Works and the `next` parameter survives. The login page does not say "Frau X invites you to class Y", so a 14-year-old gets a generic login page. |
| Student joins via code | Mobile: "Mehr" → Klassen → type code → "Weiter" → consent → "Beitreten" = 5 actions. | Works. The code is case-insensitive. A wrong code gives "Diesen Klassencode gibt es nicht. Prüfe die Schreibweise." (clear). |
| Teacher Monday morning | Dashboard (1) → class (1) → student (1) = **3 clicks** to a student's applications. | Fast. |
| Student toggles consent | 1 click per switch (the label has to be clicked, see a11y). | Fine. |
| Export | "CSV" button on the class page, 1 click. | Works (see 3). |

Load times (dev): dashboard about 4 s until the data is there, with skeletons. Class detail is similar. A production build will be faster (not measured).

## 2. What works well

- **Consent screen before joining** (`15-student-join-preview-desktop.png`): a ✓/✗ list of what the teacher sees and never sees. It is plain German and strong for a youth-data context. The same box sits permanently on "Meine Klassen".
- **Privacy is enforced, not just claimed.**
  - A seeded note ("GEHEIME NOTIZ s1: Lohn verhandeln") and a salary never appear in the timeline or the CSV.
  - Direct REST access as the teacher returns 0 rows from `applications` and 0 from `class_members`. Teachers only get data through the RPCs.
  - Student 2 switched "Firmennamen zeigen" off: the teacher sees "Firma nicht freigegeben" but still sees the status and "Lehrstelle gefunden".
  - Student 3 switched sharing off: the teacher sees only the name, "Teilt keine Daten", and the text "Ein persönliches Gespräch ist der beste Weg, um nachzufragen." This is respectful and correct.
- Role guard: a student opening `/teacher` is redirected to `/dashboard`. A teacher opening `/dashboard` or `/applications` is redirected to `/teacher`.
- Dashboard KPIs (Schüler, Bewerbungen, Gespräche, Zusagen, Lehrstelle gefunden, Inaktiv) are the right ones. The class view has filters (Inaktiv / Teilt nicht / Mit Gespräch / Mit Zusage / Lehrstelle gefunden) and a per-student distribution bar.
- Invite model: expiry (14 days), single-use personal links, open link, revoking, QR code. Mobile layout has no horizontal overflow, nav targets are 62 px high, and no touch target was under 44 px (apart from the dev tools badge).
- Dark mode of the dashboard is readable and axe reported nothing.
- A short announcement worked end to end for the teacher (published and listed).

## 3. Bugs, friction, a11y, German wording

**Bugs / functional problems**
1. **Students cannot recognise each other, and the teacher cannot recognise students.** The display name defaults to the e-mail local part (`uxtest-s1-0611`). In a real class that means "max.muster2010" or a nickname. There is no real-name field, no way for the teacher to set an alias per student, and no student number or class-list import. Every avatar shows the same **"U0"** instead of initials (all 3 students, the teacher, and the nav).
2. **Announcements are practically invisible to students.** On "Meine Klassen" they sit behind a collapsed toggle with a count. There is no badge on Start and no e-mail or push. My published test announcement was not visible on the page without opening the toggle. For a teacher this is a "message into the void".
3. **Timeline labels are misleading** (`26-student-detail-s1-desktop.png`): each event shows the *current* status, not the status at that time. Example: Swisscom shows "Frist · Gespräch 03.11." and "Erfasst · Gemerkt". "Frist · Abgeschickt 11.11." appears for an already-submitted application. For a teacher this reads as noise; they need "stage per application" at a glance. There is no age ("applied 3 weeks ago, no reply").
4. **Upcoming deadlines (14 days) only list open applications.** The dashboard showed the SBB deadline (saved) but not the UBS one (already applied). Probably intended, but it is not explained anywhere.
5. **Teacher nav "Klassen" leads to the old `/classes` page**, a second, different surface with the code and "Klasse erstellen", next to "Übersicht" (`/teacher`). Two entry points with different content. A teacher also still reaches student pages such as `/friends`.
6. **Silent drops in bulk invite** (see table above): invalid addresses and duplicates vanish with no message.
7. **CSV**: no company names (good for privacy) but also no list of applications per student. Dates are unpadded (`6.11.2026`) while the UI shows `06.11.2026`. Semicolon separator and BOM are right for Swiss Excel.
8. Student-side consent switches use `sr-only` inputs: clicking the input itself is intercepted by the label text. It works for real users but is fragile for assistive tech and tests.

**German wording**
- The consent text refers to the switches **"Status teilen"** and **"Firmen teilen"**. The real switches are called **"Fortschritt mit Lehrperson teilen"** and **"Firmennamen zeigen"**. There is no separate "Status" switch in the UI (the DB has `share_status`). The student cannot find the switch the text promises.
- "Was **Deine** Lehrperson sieht" (capital D) on "Meine Klassen", but "dein" elsewhere.
- Plural bug in code: `{c.students === 1 ? "Schüler" : "Schüler"}`, so both branches are identical. Gender style is mixed: "Schüler" (KPI labels, class card) vs "Schüler:innen" (onboarding) vs "Schülerinnen und Schüler" (class page). Pick one.
- Placeholder "10b Wirtschaft" is German-style; Swiss classes are "3. Sek A", "3b", "BM1 Wirtschaft". The "Lehrstelle gefunden" KPI label is truncated ("LEHRSTELLE GEFU…") on desktop and mobile.
- Onboarding says "Lehrperson" while the two role cards in the picker repeat the same text; the "Rolle" step is redundant.
- Mobile filter chips are cut off ("Mit Ge…") without a visible scroll cue (`31-m-class-students.png`).
- Remove-student is an icon-only trash button in each row (desktop) with no visible label next to the name; on mobile it is labelled "Entfernen". The consequence of removing is not explained on the row.

**A11y**: axe clean on the dashboard (dark). Positive: headings, `aria-label` on KPI section, skip link. Weak: the distribution bar has no legend or text alternative in the table; stats rely on colour in the bar; avatar "U0" carries no meaning.

## 4. What a teacher in a Swiss Sek / Berufswahl class needs on Monday and what is missing

What the teacher asks on Monday: *Who has no Schnupperlehre or application yet? Who has a deadline this week? Who needs a talk? Who already has a contract?* The app answers the last two well, the first two only partly.

| Need | Status in teacher-role | Gap / comment |
|---|---|---|
| Overview of progress per class | ✅ KPIs + table | Needs a "needs attention" sort that includes students who don't share. |
| Students who don't share | ⚠️ visible only as "Teilt nicht" | The riskiest group (no Lehrstelle, no contact) is exactly the invisible one. Needs an opt-in "I have no Lehrstelle yet" signal that is separate from application details. |
| Deadline calendar per class | ⚠️ 14-day list, open apps only | No calendar, no week view, no Lehrbeginn / Anmeldeschluss per trade, no class-wide deadlines the teacher sets. |
| **Schnupperlehre tracking** | ❌ | No type "Schnupperlehre" with date, Betrieb, Bericht/Beurteilung. In Sek this is half of the school year's work. |
| Bewerbungsdossier templates | ❌ | No Motivationsschreiben/Lebenslauf/Zeugnis templates, no checklist "Dossier komplett". Teachers cannot see dossier status without seeing documents. |
| Parent (Eltern) view | ❌ | Under-16s: parents expect to be involved; consent from Eltern may be legally needed (see below). No read-only parent link. |
| Berufsberater / BIZ role | ❌ | Only student and teacher. No BIZ advisor, no Schulsozialarbeit, no Lehrbetriebs-Kontakt. |
| Multi-teacher / school admin | ⚠️ Co-teachers per class (owner/co) | No school level: no school, no admin, no "all classes of Sek A/B", no transfer of a class to a successor at year end. |
| LP21 "Berufliche Orientierung" link | ❌ | No mapping to LP21 competencies, no Unterricht modules, no link to berufsberatung.ch / Berufswahlfahrplan. |
| Bulk student import | ❌ | Only paste addresses (max 60), nothing for names or CSV with class lists. Pupils often have no personal e-mail; school mailbox (`@schule.ch`) import is missing. |
| SSO (Microsoft 365 / Google Workspace for Education / edu-ID / Klapp) | ❌ | Only e-mail+password and "Weiter mit Google" (private Google). Many Swiss schools use Microsoft 365 or Google Workspace; some cantons use an own login (e.g. edu-ID, Klapp (unsicher)). SSO is usually a prerequisite for IT approval. |
| Youth data protection | ⚠️ Good technical base | See next section. |

### Youth data protection (technical and legal view, not legal advice)
- Technical: RLS plus security-definer RPCs, explicit per-student consent, 2 granular switches, "never visible" list, student can leave anytime. This is stronger than most tools.
- Missing for school adoption: privacy statement (Datenschutzerklärung) and AGB for pupils; **Auftragsdatenbearbeitung (ADV) contract with the school** or Gemeinde; data location (Supabase region, unsicher: check that the PRIVAT project is EU/CH); data retention and class-end deletion ("class archived, student data after X"); **consent of parents for under 16** (Swiss law and cantonal rules: Einwilligung of the legal representative for capable-of-judgement minors depends on the case, unsicher: ask a Datenschutzbeauftragte/r); cantonal privatim requirements for cloud tools (e.g. Zürich: Cloud-Richtlinie, unsicher).
- Default is **sharing on** (opt-out per switch). For minors, default "off until the student actively opts in" would be safer and more defensible; today the consent button reads "Beitreten und Freigabe erlauben", which bundles joining and sharing.
- Teacher can read student names and statuses after a one-click join; there is no audit log of "teacher viewed student X".

## 5. Does it REALLY help a teacher?

**Honest answer: partly. It solves "where do my students stand?" well but not yet "what do I do on Monday morning?".**

- **Core value:** an up-to-date, consent-based overview of the Lehrstellensuche of a whole class with zero manual reporting (no more "raise your hand if you applied"), plus a convincing privacy story.
- **What would make it indispensable:** (1) Schnupperlehre + Dossier tracking per class, (2) a weekly "needs attention" list (no application for 3 weeks, deadline this week, no response after X days) with one-click contact, (3) fit with school IT: SSO, class-list import, real names, (4) parent view and a ready-made Datenschutz package, (5) messages that reach students (mail/push).
- **Biggest risk:** adoption and trust, not functionality. If students use nicknames, do not share, or the teacher cannot show the school's IT/Datenschutz office a clean ADV + SSO story, the dashboard shows 0s and the teacher abandons it after two weeks. Second risk: pupils without a personal e-mail cannot even sign up.

## 6. Fix list

**P0 (before showing it to a school)**
| # | Fix | Effort |
|---|---|---|
| 1 | Real name handling: require a name at student signup/join (or teacher-set alias per class member), proper initials avatar instead of "U0" | S–M |
| 2 | Make the consent text match the real switches ("Status teilen"/"Firmen teilen" vs actual labels) and fix "Deine"; decide whether sharing starts off for under-16s | S |
| 3 | Announcements must reach students: unread badge on Start/nav + visible in "Meine Klassen" without a toggle | S |
| 4 | Bulk invite feedback: list rejected/duplicate addresses; add real CSV import (name + e-mail) | M |
| 5 | Datenschutzerklärung + ADV template + data location statement + class-end deletion policy | M |
| 6 | Invite context on login page ("Du wurdest zu Klasse X von Frau Y eingeladen") | S |

**P1**
| # | Fix | Effort |
|---|---|---|
| 7 | Schnupperlehre as an application type (date, Betrieb, Beurteilung) and a class view of it | M |
| 8 | "Needs attention" list: includes non-sharing students (opt-in "no Lehrstelle yet" flag), no reply after N days | M |
| 9 | Fix timeline: show stage per application with age; status at event time or no status | S–M |
| 10 | Remove duplicate `/classes` for teachers; drop the double role question; block student-only pages | S |
| 11 | Class deadline calendar (week view, teacher-set class deadlines such as "Dossier abgeben") | M |
| 12 | SSO: Microsoft 365 and Google Workspace for Education (Klapp/edu-ID later) | L |
| 13 | Parent consent / read-only parent link for under-16 | L |

**P2**
| # | Fix | Effort |
|---|---|---|
| 14 | Dossier checklist/templates (Motivationsschreiben, Lebenslauf, Zeugnisse) without exposing documents | M |
| 15 | School admin level (school, several classes per year, handover) and BIZ/Berufsberater role | L |
| 16 | LP21 link / Berufswahlfahrplan module, links to berufsberatung.ch | M |
| 17 | CSV: padded dates, per-application export (only shared fields); audit log "teacher viewed" | S–M |
| 18 | Polish: plural/gender consistency, "Lehrstelle gefunden" truncation, filter-chip scroll cue, Swiss class-name placeholder, label for the remove icon, legend for the distribution bar | S |

## 7. Clean-up

- The 4 throwaway accounts (1 teacher, 3 students) were deleted via the admin API, plus their class, invitations, memberships and applications. Verified by SQL (class, invitation, member and note counts all 0).
- The dev server was stopped.
- One account, `uxtest-explorer-0611@example.com`, remains in the project. It is not mine (another helper's) and I left it alone.
- No mail or message was sent, nothing was pushed or deployed, and `main` and `test.panat@gmail.com` were not touched.
