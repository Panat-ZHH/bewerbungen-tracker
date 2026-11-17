# WendApply UX & Design Principles

Status: v1 (2026-11-17), research agent. Binding for every UX/design/website/persona agent (see `_ux/BRIEF-SHARED.md`).
Scope: the app (pupil, parent, teacher, school) and the marketing website. Identity stays the same: warm paper, Bricolage Grotesque + Instrument Sans, outlined "sticker" cards, yellow/blue accents, the figures, the logo, dark mode (see `docs/design-system.md`).
The goal is **calmer and more logical, not blander**: keep the sticker look, but give it to fewer things so the important things stand out.

How to use this doc: every rule marked **R-…** is testable. Before and after changing a page, score it with the checklist in section 9. Sources are numbered `[n]` (section 11).

---

## 0. The six rules that matter most

1. **One job per screen, one primary action per screen** (R-1.1, R-5.1).
2. **One loud thing per viewport.** At most one element with outline + hard shadow + accent fill = the primary card *or* the primary button (R-6.1).
3. **Show the next step, hide the rest until needed** (progressive disclosure, R-2.2).
4. **Same thing, same name, same place, same colour** (consistency, R-1.4, R-6.4).
5. **Every error says what happened and how to fix it**, next to the field, in plain words (R-4.4).
6. **Accessible by default:** WCAG 2.2 AA, 44 px targets, visible focus, reduced motion (R-7.x).

---

## 1. Nielsen's 10 usability heuristics [1]

| # | Heuristic (what it means) | In WendApply |
|---|---|---|
| 1 | **Visibility of system status** – always tell users what is going on, quickly. | Every save gives feedback within 1 s (toast or inline "Gespeichert"). Long actions show a spinner in the button (`loading`), never a frozen screen. Lists show counts ("12 Stellen"). Progress in multi-step flows: "Schritt 2 von 3". |
| 2 | **Match the real world** – the user's words and concepts, not ours. | Swiss school words: Lehrstelle, Lehrbetrieb, Schnupperlehre, Bewerbung, Zusage/Absage. No tech words (Datenbank, Sync, Token, Account-ID, Workspace). Order things as in real life: Gemerkt → In Vorbereitung → Abgeschickt → Gespräch → Zusage. |
| 3 | **User control and freedom** – easy undo and a clear exit. | Destructive actions: confirm dialog **or** undo toast (prefer undo). Every sheet/modal closes via ✕, Esc and back gesture. Every sub-page has a back link to its parent. |
| 4 | **Consistency and standards** – same thing looks and works the same everywhere; follow platform conventions (Jakob's law). | One term per concept (glossary in `_ux/GLOSSARY.md`). Buttons, badges, cards only from `components/ui`. Primary action in the same position on each page type (page header right on desktop, sticky bottom on phones for forms). |
| 5 | **Error prevention** – prevent problems before they happen. | Constrained inputs (date pickers, selects, autocomplete) instead of free text where possible. Disable nothing silently: if an action is not possible, say why. Warn before leaving a form with unsaved changes. |
| 6 | **Recognition rather than recall** – make options visible. | Show recently used places/jobs; prefill known data (name, school, place). Filters show their current value on the chip ("Umkreis: 20 km"). Never ask the user to remember a code from another screen – offer copy/share buttons. |
| 7 | **Flexibility and efficiency** – shortcuts for experts without hurting novices. | Teachers/schools: bulk actions and search in lists. Pupils: "Ähnliche Stellen", quick status change from the list. Keyboard: Enter submits, Esc closes. |
| 8 | **Aesthetic and minimalist design** – every extra element competes with the relevant ones. | Remove decoration that carries no information. Max 2 doodles per screen, 1 tilted sticker per screen. No duplicate headings ("Dashboard" title + "Übersicht" subtitle saying the same). |
| 9 | **Help users recognise, diagnose and recover from errors** – plain language, precise problem, constructive fix. | See R-4.4. Never show raw error text, codes or English (`lib/ux.ts friendlyMessage`). |
| 10 | **Help and documentation** – easy to find, task-focused, short. | Help link in the same place on every app page (account/"Mehr" menu → "Hilfe") – WCAG 3.2.6. Inline hints ("Was ist eine Schnupperlehre?") as short expandable text, not separate pages. |

---

## 2. Cognitive load, progressive disclosure, hierarchy [2][3][4]

**2.1 Cognitive load** – every element, choice and word costs mental effort; teens have less patience and lower reading levels than adults [13].
- **R-2.1** Per screen max **one H1, ≤ 3 sections**, ≤ 7 visible navigation items (Miller: chunk, don't cram), ≤ 5 filters visible by default.
- Body text lines ≤ 70 characters (`max-w-prose`/`65ch`). Paragraphs ≤ 3 sentences in the app.

**2.2 Progressive disclosure** – show the few most important options first; advanced ones on request [3].
- **R-2.2** Default view shows only what 80 % of users need. Advanced filters behind "Mehr Filter"; rare settings behind "Erweitert"; secondary info in the detail page, not the list row.
- Max **2 levels** of disclosure (a panel inside a panel inside a panel is forbidden).
- The label of the trigger says what's inside ("Mehr Filter (3)" not "Optionen").

**2.3 Visual hierarchy** – size, contrast, weight and space signal importance; users scan in F/layer-cake patterns [4].
- **R-2.3** Squint test: when blurred, a page shows exactly 1 title, 1 primary action and clearly separated groups. Order on every page: Title → (one-line description) → primary action → content → secondary stuff.
- Lists: the most important word first in every row (company or job title, then meta).

---

## 3. Laws of UX [5]

| Law | Meaning | In WendApply |
|---|---|---|
| **Hick's law** | Decision time grows with the number and complexity of choices. | Max 5 options in a menu group, max 3 buttons in one action group; first-run dashboard = exactly one next step (`nextStep()`). Highlight the recommended option. |
| **Fitts's law** | Time to hit a target depends on its size and distance. | Primary buttons ≥ 44 px high, full width on phones in forms. Put the action near where attention already is (end of form, bottom of sheet). Destructive actions small and far from the primary one. |
| **Miller's law** | Working memory holds ~7 ± 2 items – chunk information. | Group form fields into labelled chunks of ≤ 5 fields. Format codes in groups ("ABCD-1234"). Show at most 7 status steps. |
| **Jakob's law** | Users expect your app to work like the apps they already use. | Bottom tab bar on phones, back arrow top left, search with a magnifier, swipe/Esc closes sheets, pull-down-to-close patterns. Don't invent new gestures. |
| **Law of proximity** | Things close together are seen as related. | Label sits 4–8 px from its field, 24 px between field groups. Space between sections (32–48) clearly larger than within (8–16). Use space before lines/borders. |
| **Law of common region** | Things inside a shared boundary are seen as a group. | A card (`.panel`) = one topic. Never wrap unrelated things in one card; never put cards inside cards (use `.rows` / `.inset`). |
| **Von Restorff (isolation)** | The one thing that differs is remembered. | Works only if there is *one* such thing: that's why R-6.1 limits accents. |
| **Doherty threshold** | Productivity soars when the system responds < 400 ms. | Optimistic UI for status changes; skeletons after 300 ms; never block typing. |

---

## 4. Forms and error messages [6][7][9][10]

**4.1 One thing per page / task-based flows (GOV.UK)** – break long tasks into small steps, each with one question or one closely related group [9].
- **R-4.1** Onboarding, sign-up, licence/family invite and "Bewerbung erfassen" (first time) are **step flows** with ≤ 5 fields per step, a step counter, and a "Zurück" link. Editing an existing item may use one page.
- Ask only what we really need; mark **optional** fields with "(optional)", not required ones with \*.

**4.2 Labels and layout** [6]
- Labels **above** fields, always visible (no placeholder-only labels). Hint text between label and field.
- Single column. Field width hints the expected length (PLZ short, Firma long).
- Use the correct input types (`type=email`, `inputmode=numeric`, `autocomplete=` attributes).

**4.3 Redundant entry (WCAG 3.3.7)** – don't ask for the same information twice in a process.
- **R-4.3** Prefill from profile/previous step (name, school, Wohnort, class code from the link). Offer "gleiche Adresse wie…" selections.

**4.4 Error messages** [7][9]
- **R-4.4** Format: **what happened + how to fix**, in the user's words, next to the field, red text + icon (not colour alone), field gets `aria-invalid`. On submit with errors: summary at top (`role="alert"`), links to each field, focus moves to the summary/first field.
- Examples: "Gib eine E-Mail-Adresse ein, z. B. name@beispiel.ch" (not "Ungültige Eingabe"); "Das Datum muss in der Zukunft liegen" (not "Validation error").
- No blame, no jokes in errors, no exclamation marks, no "Oops". Validate on blur/submit, not on every keystroke.
- Server errors: say what still works and what to do ("Nicht gespeichert – prüfe deine Verbindung und versuche es nochmals. Deine Eingaben bleiben erhalten.").

---

## 5. Navigation, actions and touch targets [8][11][12]

- **R-5.1 One primary action per screen.** Exactly one `primary` (blue) or `sun` button visible per viewport; all others `secondary` or `ghost`. `sun` only for the single joyful main step (e.g. "Bewerbung eintragen" on the dashboard).
- **R-5.2 Button labels: verb first, max 3 words**, says what happens: "Bewerbung speichern", "Klasse erstellen", "Code kopieren". No "OK", "Weiter" alone at the end of a flow, "Hier klicken", "Absenden".
- **R-5.3 Touch targets ≥ 44 × 44 px** on touch devices (Apple HIG 44 pt [11]; Material 48 dp [12]; WCAG 2.5.8 minimum 24 px [8]) with ≥ 8 px between adjacent targets.
- **R-5.4 Navigation:** phones = bottom tab bar with max 5 items (icon + label), the rest in "Mehr"; desktop = top bar. The active item is always marked. Each role sees only its own items (no dead entries for other roles).
- Links look like links (brand colour + underline on body text). Buttons do things, links go places.
- Back: every non-top-level page has a visible back link with the parent's name ("← Bewerbungen").

---

## 6. Calm, low-noise UI (the "calmer sticker book") [2][4][12]

The sticker identity works when stickers are *special*. When everything has a contour, a shadow, a tilt and a colour, nothing stands out and the page looks loud.

- **R-6.1 Accent budget per viewport:** max **1** element with outline + hard shadow + accent fill (the primary card or the primary button); max **2 more** `.panel` stickers; everything else is plain `.rows` on paper or `.inset`. Max **1** tilted element, max **2** doodles, max **1** `marker` highlight.
- **R-6.2 Colour budget:** per screen, at most **2 accent colours** besides ink/paper (blue = action, + yellow *or* the status colours). Coral only for celebration moments. No coloured section backgrounds stacked on top of each other.
- **R-6.3 Fewer borders:** separate with **space first**, then a dashed divider, then a border. A list inside a card has no row borders other than `.rows` dividers. Badges without outline when inside a row (flat tone bg) – the outlined sticker badge only for the one status that matters on the page.
- **R-6.4 Status colours have fixed meaning everywhere** (as in `docs/design-system.md`): paper = Gemerkt, yellow = In Vorbereitung, blue = Abgeschickt/Schnuppern/Test, coral = Gespräch, green = Zusage/Vertrag, sand = Absage/Zurückgezogen. Red (`danger`) only for real errors and destructive actions. Never reuse a status colour for decoration.
- **R-6.5 Spacing scale:** only **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px** (Tailwind 1/2/3/4/6/8/12/16). Inside a component 8–16, between components 16–24, between sections 32–48, page top 24 (phone) / 32–48 (desktop). Page side padding 16 (phone) / 24–32 (desktop). No arbitrary values (`mt-[13px]`).
- **R-6.6 Type scale** (existing classes, use only these): `text-hero` (website only) → `text-display` (dashboard greeting only) → `text-title` (one per page = H1) → `text-heading` (20 px, section H2) → `text-body` (15 px) → `text-small` (13 px) → `text-label` (13 px, 600). Min 13 px for any text (tab labels min 11 px). Max **3 sizes** in one card. Weights: 800 titles, 600–700 labels/buttons, 400 body. No ALL-CAPS with letter-spacing.
- **R-6.7 Motion:** only to explain a change (sheet opens, item saved) or to celebrate a real milestone (Zusage). ≤ 300 ms for UI, ≤ 600 ms for celebrations, nothing loops, everything off with `prefers-reduced-motion`.
- **R-6.8 Alignment:** one left edge per column; numbers right-aligned and `tabular`; icons share one size per context (16 inline, 20 buttons, 24 nav).

---

## 7. Accessibility – WCAG 2.2 AA [8][10]

Swiss federal sites must meet eCH-0059 v3 (= WCAG 2.1 AA) [10]; we aim one step higher at **WCAG 2.2 AA**.

- **R-7.1 Contrast:** text ≥ 4.5:1, large text (≥ 24 px or ≥ 18.7 px bold) ≥ 3:1, UI component boundaries, icons and focus indicators ≥ 3:1 (1.4.3, 1.4.11) – in light **and** dark mode. `--muted` only on paper/surface, never on accent fills.
- **R-7.2 Focus visible and not obscured (2.4.7, 2.4.11):** 3 px brand focus ring on every interactive element; sticky header, tab bar, toasts and cookie banners must never cover the focused element (use `scroll-padding`).
- **R-7.3 Target size (2.5.8):** min 24 px everywhere, 44 px our standard on touch (R-5.3).
- **R-7.4 Not colour alone (1.4.1):** status = colour + text label (+ icon where useful).
- **R-7.5 Reduced motion (2.3.3 / media query):** confetti, stamps, wiggle, parallax off.
- **R-7.6 Consistent help (3.2.6):** help/contact link in the same place on every page.
- **R-7.7 Redundant entry (3.3.7)** and **accessible authentication (3.3.8):** allow paste in password and code fields, offer password managers (`autocomplete`), no puzzles.
- **R-7.8 Structure:** one H1, logical H2/H3, landmarks, skip link, labels bound to inputs, live region for toasts, `lang="de-CH"`. Dragging (2.5.7) always has a click alternative.
- **R-7.9 Zoom/reflow (1.4.10):** works at 320 px width and 200 % text without horizontal scrolling.

---

## 8. Audiences, language and flows [9][13][14][15][16]

**8.1 Pupils (13–16)** – teens are confident but less successful than adults; they skim, are impatient, dislike childish design and big text walls, and want to be treated as capable [13][14].
- Short sentences, concrete next step, visible progress, quick wins (rewards for *real* progress only). Not "kiddy": no baby talk, no excessive emojis (max 1 per message), no cartoon overload.
- Mobile-first: every pupil flow must be fully usable one-handed at 375 px.
- Gamification never blocks a task and never shames (Absage = calm, sand colour).

**8.2 Parents** – occasional visitors, want reassurance and a quick overview, often on the phone.
- First screen answers "Wie läuft es bei meinem Kind?" in one glance + one suggested action ("Nachfragen", "Ermutigen"). No pupil-internal jargon (points, streaks) without an explanation.

**8.3 Teachers and schools** – busy, desktop + phone, responsible for many pupils; want efficiency, overview, trust and data protection clarity.
- Tables/lists with sorting, search and filters; bulk actions; "who needs help?" first (pupils without activity, deadlines). Neutral, professional tone; privacy facts visible where data is shown.

**8.4 Plain language / Leichte & Einfache Sprache** [15][16]
- Write at **Einfache Sprache** level (approx. B1): one statement per sentence, ≤ 15 words per sentence where possible, active voice, common words, explain unavoidable terms once ("Schnupperlehre – ein paar Tage im Betrieb mitarbeiten").
- Avoid nominal style ("Durchführung der Erfassung" → "Bewerbung eintragen"), double negatives, abbreviations (z. B. is OK). Numbers as digits. Swiss spelling (ss), CHF.
- Address: **proposal** – "du" for pupils and parents, "Sie" for teachers/schools (school-facing pages and B2B website pages). The copywriter decides in `_ux/GLOSSARY.md`; follow that file.

**8.5 Empty states, onboarding, next best action** [17]
- **R-8.5a Empty state = 3 parts:** what this place is for (1 line) + why it's empty + **one** button to fill it ("Erste Bewerbung eintragen"). Never a blank page or just "Keine Daten".
- **R-8.5b Onboarding:** ≤ 3 steps, skippable, learn-by-doing (the first real action *is* the tutorial), no carousel of feature slides. Ask role first, then only role-relevant questions.
- **R-8.5c Next best action:** dashboards of every role lead with exactly one recommended next step based on data (`lib/next-step.ts` for pupils; similar for parents/teachers: "3 Schüler/innen ohne Bewerbung diese Woche → Ansehen").

---

## 9. Per-page heuristic checklist (score 0–15)

Score each page **before and after** changes; 1 point per "yes". Record in `_ux/findings/<page>.md` with screenshots at 375 px and 1280 px. Target: **≥ 13** for every main page, no page below 11.

1. **Purpose:** Is it clear within 5 s what the page is for and for whom (one H1, plain title)?
2. **Next step:** Is there exactly one primary action (one blue/sun button) per viewport, with a verb label ≤ 3 words?
3. **Accent budget:** Max 1 loud element (outline + shadow + accent fill), ≤ 2 more stickers, ≤ 2 doodles, ≤ 1 tilt?
4. **Hierarchy:** Does the squint test show title → primary action → grouped content, with ≤ 3 sections?
5. **Spacing & type:** Only scale values (4/8/12/16/24/32/48/64) and only the defined type classes, ≤ 3 text sizes per card?
6. **Progressive disclosure:** Are advanced/rare options hidden behind a clearly named trigger, ≤ 5 filters visible?
7. **Language:** Plain Swiss German, consistent glossary terms, no tech jargon/English, sentences short?
8. **Status & feedback:** Does every action give visible feedback (loading, success, error) within 1 s, and are status colours used with their fixed meaning + text?
9. **Errors:** Do error messages say what happened + how to fix, next to the field, with a summary on submit?
10. **Control:** Is there a clear way back/out (back link, close, Esc) and undo or confirm for destructive actions?
11. **Empty/first-run state:** Does the empty state explain the page and offer one action?
12. **Mobile:** At 375 px: no horizontal scroll, touch targets ≥ 44 px, primary action reachable (not hidden behind the tab bar)?
13. **Contrast & focus:** Text ≥ 4.5:1 (light and dark), visible focus ring never covered by sticky elements?
14. **Consistency:** Same components, positions and names as on other pages of the same type (Jakob/heuristic 4)?
15. **Role fit:** Does the page show only what this role needs, in its tone (pupil: short and encouraging; parent: overview + reassurance; teacher/school: efficient, bulk, neutral)?

Score: ___ / 15. Notes: main problem, fix, screenshot paths.

---

## 10. Calm-design rules for the marketing website [4][18][19]

The website (`app/page.tsx` and public pages) should feel **editorial**: like a good magazine about starting work, not a busy SaaS landing page.

- **W-1 One message per section.** Each section = one heading (benefit, not feature name), ≤ 2 sentences, one visual, at most one link/button. Max **6–7 sections** on the home page.
- **W-2 Whitespace is the design:** section padding 64–96 px desktop / 48–64 px phone; content width ≤ 1120 px, text width ≤ 65 ch. Prefer one big image/screenshot over three small cards.
- **W-3 Typographic hierarchy does the work:** `text-hero` once (H1), then H2 in `text-title`, body 17–18 px on the website, line-height 1.5–1.6. Max 3 type sizes per section. Headings left-aligned (centre only for the hero and the final CTA).
- **W-4 One CTA, repeated:** the same primary CTA ("Gratis testen" / per glossary) in the hero and at the end; secondary CTA as a text link. Audience entry points (Schüler/in, Eltern, Lehrpersonen, Schulen) as quiet links, not 4 loud cards.
- **W-5 Calm stickers:** max 1 sticker card/tilt + 1 doodle per section; alternate full-paper sections with at most one tinted (`--surface-2`) band; no stacked coloured backgrounds, no auto-playing carousels, no counters/tickers.
- **W-6 Proof, not hype:** concrete facts (price from code, "1 Woche gratis", data stored in Switzerland if true) instead of adjectives; screenshots of the real app; no fake numbers or testimonials.
- **W-7 Navigation:** ≤ 5 top items + one CTA button; footer holds legal pages. Same help/contact place on every page.
- **W-8 Performance & accessibility are part of calm:** LCP < 2.5 s, no layout shift, images with `alt`, WCAG 2.2 AA as in section 7. Styles scoped (`.site`), app tokens untouched.

---

## 11. Sources

1. Nielsen Norman Group – 10 Usability Heuristics for User Interface Design. https://www.nngroup.com/articles/ten-usability-heuristics/
2. NN/g – Minimize Cognitive Load to Maximize Usability. https://www.nngroup.com/articles/minimize-cognitive-load/
3. NN/g – Progressive Disclosure. https://www.nngroup.com/articles/progressive-disclosure/
4. NN/g – Visual Hierarchy in UX: Definition. https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
5. Jon Yablonski – Laws of UX (Hick, Fitts, Miller, Jakob, Proximity, Common Region, Von Restorff, Doherty). https://lawsofux.com/
6. NN/g – Website Forms Usability: Top 10 Recommendations. https://www.nngroup.com/articles/web-form-design/
7. NN/g – Error-Message Guidelines. https://www.nngroup.com/articles/error-message-guidelines/
8. W3C – Web Content Accessibility Guidelines (WCAG) 2.2, and What's New in WCAG 2.2. https://www.w3.org/TR/WCAG22/ · https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
9. GOV.UK Design System – Question pages ("one thing per page"), Error message, Task list, Writing for GOV.UK (plain English). https://design-system.service.gov.uk/patterns/question-pages/ · https://design-system.service.gov.uk/components/error-message/ · https://design-system.service.gov.uk/components/task-list/ · https://www.gov.uk/guidance/content-design/writing-for-gov-uk
10. Swiss Confederation – Design System of the Federal Administration (GitHub / Storybook) and Accessibility in the federal administration (eCH-0059 v3 = WCAG 2.1 AA). https://github.com/swiss/designsystem · https://swiss.github.io/designsystem/ · https://www.edi.admin.ch/en/accessibility-in-the-federal-administration · https://www.ech.ch/de/ech/ech-0059
11. Apple – Human Interface Guidelines: Accessibility (44×44 pt hit targets), Layout, Typography. https://developer.apple.com/design/human-interface-guidelines/accessibility · https://developer.apple.com/design/human-interface-guidelines/layout
12. Google – Material Design 3: Accessibility/touch targets (48 dp), Spacing/layout (4 dp grid), Navigation bar. https://m3.material.io/foundations/designing/structure · https://m3.material.io/foundations/layout/understanding-layout/spacing · https://m3.material.io/components/navigation-bar/guidelines
13. NN/g – Teenager's UX: Designing for Teens. https://www.nngroup.com/articles/usability-of-websites-for-teenagers/
14. NN/g – UX Design for Teenagers (Ages 13–17), report, 3rd ed. https://www.nngroup.com/reports/teenagers-on-the-web/
15. Netzwerk Leichte Sprache – Die Regeln für Leichte Sprache (Regelwerk, PDF). https://www.netzwerk-leichte-sprache.de/fileadmin/content/documents/regeln/Regelwerk_NLS_web.pdf
16. Pro Infirmis – Büro für Leichte Sprache (Schweiz; ca. 800 000 Menschen in der Schweiz fällt das Lesen schwer). https://www.proinfirmis.ch/angebot/zuerich/buero-fuer-leichte-sprache.html
17. NN/g – Designing Empty States in Complex Applications; Mobile-App Onboarding. https://www.nngroup.com/articles/empty-state-interface-design/ · https://www.nngroup.com/articles/mobile-app-onboarding/
18. NN/g – How Users Read on the Web / F-Shaped Pattern. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
19. web.dev – Core Web Vitals (LCP, CLS, INP thresholds). https://web.dev/articles/vitals
