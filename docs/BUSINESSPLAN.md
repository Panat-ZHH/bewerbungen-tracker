# WendApply – Business Plan

Status: 14 Nov 2026 · Author: Panat Ruangsri (with research support) · Planning period: Dec 2026 – Nov 2027, plus a rough look at years 2–3.

How to read this: figures with a source are facts (see [Sources](#sources)). Anything marked **(A)** is an assumption or estimate and should be tested. Prices are in CHF, excluding VAT, at an assumed rate of **USD 1 = CHF 0.80 (A)**.

---

## 1. Executive summary

WendApply (wendapply.ch) is a web app that helps Swiss Sek-I pupils (about 14–16 years old) find and land an apprenticeship (Lehrstelle). It brings together Lehrstellen search, an application tracker, a document store, reminders, an AI check of application letters, a gamified island map that rewards every application sent, and a class view for teachers that pupils control themselves.

- **Problem:** Each year about 91,000 young people leave compulsory school, and about half of them go straight into vocational training. They send about 8 applications on average. Their top difficulties are writing the application documents (34%), finding suitable places (32%) and coping with rejections (about 23%). Teachers follow the process with Excel lists and questions in the break.
- **Gap:** No Swiss product combines tracking, document help, AI feedback and a class overview for this age group. Yousty dominates listings, and its revenue comes from companies. berufsberatung.ch/LENA is official and free but has no tracking. Canton St. Gallen's free portal is the closest match to our teacher view.
- **Model:** Pupils use it for free. Revenue comes from (1) **school licences** (CHF 99 per class or CHF 690–1,990 per school per year, below every procurement threshold), (2) **WendApply Plus** for families (CHF 29 per school year), and (3) later, **canton or BIZ framework contracts** and optional **company listings**.
- **Honest outlook:** The Swiss market is small. Our realistic share in three years is in the tens of thousands of CHF per year, not millions. Running costs are tiny (about CHF 40–70 per month; one AI check costs about 0.2–0.3 Rappen). The real bottlenecks are **trust (data protection for minors), school buying cycles and founder time**, not money. **Base case:** about CHF 6,500 revenue in the first 12 months, about CHF 33,000 in year 2 and about CHF 85,000 in year 3. Becoming a full-time business needs a canton contract, a foundation grant or the employer side.
- **Ask / next step:** Put the AI check live, get the legal package reviewed by a lawyer, and run 3 free pilot classes in Jan–Mar 2027, the peak of the application season.

## 2. Problem

1. **Pupils (14–16) are overwhelmed by a process designed for adults.**
   - In 2025, 34% said writing the application documents was the hardest part, 32% struggled to find suitable places and about 23% struggled with many rejections (Nahtstellenbarometer 2025).
   - The average was 8 applications, and often many more for popular trades.
   - Deadlines, Schnupperlehren, follow-ups and rejections get lost across e-mail, paper and Yousty.
2. **Feedback on letters is scarce and late.**
   - Teachers and parents correct letters when they have time.
   - Parents differ hugely in how much they can help, which is a fairness issue.
3. **Teachers lack an overview.**
   - The LP21 module "Berufliche Orientierung" makes Berufswahl a school task in grades 8–9.
   - Teachers still track "who has applied where, who needs help" by hand.
   - Only St. Gallen has started a cantonal portal with a class view.
4. **Motivation drops after rejections.** About a quarter of training companies also say they get too few suitable applications (EHB 2026). The market is not short of places; pupils are short of follow-through.

## 3. Target audience & personas

| Persona | Who | Needs | Pays? |
|---|---|---|---|
| **Lea, 14, 2nd Sek (grade 8)** | Wants to become FaGe, first Schnupperlehren, phone always at hand | Simple list of applications, reminders, "is my letter OK?", motivation | No (free tier) |
| **Arian, 15, 3rd Sek (grade 9), Niveau B/C** | 20+ rejections, parents can't help with German letters | Concrete letter fixes, encouragement, not losing track | Free, or Plus paid by parents/school |
| **Frau Keller, class teacher 3rd Sek** | 20 pupils, Berufswahl lesson once a week | Class overview without extra work, who needs attention, deadlines | Champion; school pays |
| **Schulleitung / Schulpflege** | Decides tools and budget, worried about data protection | AVV, data location, fixed price, low admin | **Buyer** |
| **Parents** | Want to help but don't know the Swiss system (often migrant families) | Visibility (with the child's consent), letter help | **Plus buyer** |
| **Berufsberatung / BIZ, cantons** | Multipliers with a public mandate | Fewer pupils without a solution, data | Possible framework buyer (later) |
| **Companies (Lehrbetriebe), later** | About 59,000 in CH; a quarter lack suitable applicants | Reach motivated, well-prepared applicants | Listings (year 3, optional) |

Side segments with high need all year: **10th school year and bridge programmes** (11–17% of leavers) and **pupils older than 16** (41% of 2026 apprenticeship starters).

## 4. Value proposition

- **For pupils:** "Your whole Lehrstellen search in one place, and every application builds your island."
  - Tracker with a Lehrstellen status pipeline (Schnupperlehre → application → interview → Zusage).
  - Search across Yousty, jobs.ch and jobup.ch.
  - Documents and reminders.
  - An AI check that returns a score and copy-ready "before/after" sentences in about 20 seconds, in Swiss German "Du" form.
- **For teachers:** "Know in 1 minute who in your class needs help."
  - Class dashboard, "braucht Aufmerksamkeit" list, deadlines, timeline, nudges, announcements, CSV export.
  - Pupils decide what the teacher sees (three switches; notes, salary and CV are never shared).
- **For schools:** a data-protection-ready package (privacy notice for young people, school annex, AVV, deletion concept) at a price below procurement thresholds.
- **For families (Plus):** unlimited AI feedback that does not depend on the parents' German skills.

**Differentiation in one sentence:** WendApply is the only Swiss tool that coaches the *pupil's process*, from first Schnupperlehre to signed contract, with AI feedback and a consent-based teacher view. Listing platforms only handle *finding* a place.

## 5. Product today (honest status, 14 Nov 2026)

**Live in production (wendapply.ch, release-p0 since 9 Nov 2026):**
- Accounts: e-mail login and Google login (Google login has its own branch; check that it is merged). Onboarding in 3 screens. Account deletion is tested end to end.
- Application tracker with Lehrstellen status pipeline, detail page and drafts. A save bug was fixed on 9 Nov.
- Dashboard, analytics, "Meine Dokumente" (CV/document storage), reminders (in-app, ics; push untested on real devices).
- Job/Lehrstellen search with filters, synonyms and URL sharing. It **scrapes** Yousty, jobs.ch and jobup.ch, so it can break at any time and must be checked against their terms (see risks).
- Gamified 3D island map: 100 points per application sent, shop, 4 islands (free, 600, 1500 and 3000 points), friend islands (view only).
- Friends, classes, teacher role (dashboard, invites incl. bulk/CSV, nudges, announcements, timeline, class calendar, audit log).
- Public pages: landing page, /schulen (free pilot offer), Hilfe, Kontakt, Impressum (**still has [TODO] markers**), privacy pages.

**Beta or not live yet:**
- **AI Bewerbungs-Check:** works with the real model (claude-haiku-5-5) on the `ai-review` preview only. **Not merged into main, not in production.**
  - Prompt eval: 32/33 runs clean.
  - Cost: about 0.2–0.3 Rappen per check, about 21 s per check.
- **E-mail:** registration mails depend on SMTP setup (Brevo). The earlier block was the Supabase default limit of 2 mails per hour. Check the current state before outreach.
- **Legal package (docs/legal):** drafts only. **A lawyer must review it before any school uses it.**
- **No payment system, no paid tier, no company entity** (A: none registered yet).

**Usage:** a handful of accounts (5 users at the last count, early Nov 2026). There is **no evidence yet of retention or willingness to pay.**

**Tech and hosting:**
- Next.js 16, Supabase (eu-west-1, Ireland), Netlify, Anthropic API (US).
- Over 380 automated tests.
- Built by one person with AI coding agents.

## 6. Market size (Switzerland)

**Base numbers:**

| Metric | Value | Source |
|---|---|---|
| Compulsory-school leavers per year | 93,026 (2025); >91,000 (2026) | Nahtstellenbarometer 2025, SBFI 29.10.2026 |
| Sek-I pupils | ~283,000–286,000 (2022/23–2023/24) | BFS Jahrbuch 2024; Statista/BFS |
| Pupils in grades 8–9 (HarmoS 10–11) | ~180,000–190,000 | (A) 3 grades of ~95k |
| Sek-I schools | 1,623 (2022/23) | BFS Jahrbuch 2024 |
| Sek-I classes / of which grade 9 | ~15,000 / ~5,000 | (A) 19 pupils per class |
| Apprenticeship places offered | ~86,000 (2026), 88% filled | SBFI 29.10.2026 |
| New apprenticeship contracts | ~76,000 per year | SBFI 17.09.2026, BFS |
| Leavers going straight into vocational training | 49–50% | Nahtstellenbarometer / SBFI |
| Training companies | ~59,000 | EHB 10.11.2026 |
| German-speaking share of apprenticeship entries | ~75–80% | (A) |

**TAM, SAM and SOM (annual revenue potential, CHF):**
- **TAM (all of Switzerland, all revenue streams), about CHF 6–7 M per year (A):**
  - Schools: about 200,000 pupils (grades 8–9 plus the 10th year) × CHF 5 = about **CHF 1.0 M**.
  - Families: 90,000 leavers per year × CHF 29 Plus = about **CHF 2.6 M** if everyone paid. This is a theoretical upper bound.
  - Employer recruiting spend on apprentice marketing: Yousty alone has over 3,800 paying company customers. At an assumed average of CHF 1,000–1,500 per year, that is about **CHF 4–6 M** (A).
- **SAM (German-speaking CH, schools plus families; no employer side in years 1–2), about CHF 1.0–1.5 M per year:**
  - Schools: about 140,000 pupils × CHF 5 = CHF 0.7 M.
  - Families: Plus potential about CHF 0.3–0.8 M (A).
- **SOM (realistic within 3 years), about CHF 50,000–100,000 per year:**
  - About 60 schools or about 300 classes, which is ~4% of German-speaking Sek-I schools.
  - Plus a few hundred Plus families.
  - That is roughly **5–8% of SAM** (A).

**Takeaway:** a profitable niche or social business is possible. A VC-scale business is not possible in Switzerland alone. Scale would need other language regions (FR/IT) or DACH (Germany has ~470,000 new Ausbildung contracts a year, background figure (A)).

## 7. Competitors

| Player | What / who pays | Strengths | Weaknesses | Our differentiation |
|---|---|---|---|---|
| **Yousty.ch** | Leading Lehrstellen marketplace. Companies pay (3,800+ customers); free for pupils | ~5 M visits per year, >60k listings, apply flow, brand known in schools, free Berufs-Check and teaching material | No AI letter check, no class dashboard, tracking only for applications sent via Yousty, built for employers | Neutral tracker across all sources, AI coaching, teacher view, motivation. **Biggest threat if they add AI or a dossier.** |
| **berufsberatung.ch / LENA (SDBB)** | Official, publicly funded, free | Trusted, neutral, ~14,000 open places for 2026 | Incomplete (big firms list elsewhere), no login since the July 2026 relaunch, no tracking; myBerufswahl was retired in 2022 | We complement it: link to LENA, help pupils follow through. A potential partner, not a rival. |
| **Berufswahl-PortalSG (Kanton SG)** | Cantonal portal, the canton pays | Class view for teachers, Schnupper sign-up, free for companies | St. Gallen only, no AI, no gamification, no document store | Works in every canton now. A template for what cantons want (and maybe buy). |
| **gateway.one** | Multicheck/Basic Check tests, pupils and companies pay | De facto standard aptitude tests | Test-centred, no tracker, no school dashboard | Not head-to-head. Store Multicheck results as documents. |
| **Profolio / Berufswahltagebuch / Berufswahlordner** | Printed or PDF teaching materials, CHF 15–25 per pupil or free | In the curriculum, teachers know them | Static, no live tracking, no AI | Partner: "the digital application part of your dossier". |
| **jobs.ch / jobup.ch** | General job boards, apprenticeship ads free for companies | Large employer base | Not made for 14-year-olds | Used only as a search source. |
| **Kickresume, Teal, Jobscan, BewerbungGPT** | Adult AI CV tools, €8–50 per month | Strong AI writing, trackers | Not tuned to Swiss Lehrstelle norms, no school layer, privacy issues for under-16s | Swiss German, Lehrstelle-specific, school-safe, free for pupils. |
| **Azubiyo, Ausbildung.de, Azubi.de (DE)** | Employers pay about €300–1,100 per ad | Proven employer-pays model | Germany only | Shows the long-term employer-side option. |
| **Status quo: Excel, paper, WhatsApp** | Free | Zero friction, no data-protection questions | No overview, no feedback | Our real main competitor. We must be easier than Excel. |

## 8. Pricing & tiers

Principle: **never charge the pupil.** Gamification points can **never** be bought with money (no pay-to-win, no loot boxes for minors).

| Tier | Who pays | Price | Included |
|---|---|---|---|
| **Free (pupil)** | – | CHF 0 | Tracker, search, documents (100 MB), reminders, island map, friends, joining classes, **3 AI checks per month** |
| **Plus (pupil/family)** | Parents (paid via TWINT or card by an adult) | **CHF 29 per school year** (Aug–Jul) or CHF 4.90 per month | Unlimited AI checks (fair use 10 per day), AI help for the Lebenslauf (planned), parent view (with the child's consent), cosmetic map extras |
| **Teacher Free** | – | CHF 0 | 1 class of up to 30 pupils, class overview, invites |
| **Class licence** | School | **CHF 99 per class per year** | Plus for every pupil in the class, all teacher features, export, co-teachers |
| **School licence** | School / commune | **S (≤6 classes) CHF 690 · M (≤15) CHF 1,290 · L (unlimited) CHF 1,990 per year** | All classes, Plus for all pupils, school-head dashboard (anonymised), AVV, priority support, intro session; equals about CHF 4–7 per pupil per year |
| **Canton / BIZ framework** | Canton, BIZ | Negotiated, target **CHF 2–3 per pupil per year** | All schools in a region, reporting, later SSO (Edulog) |
| **Company listing (2028+, optional)** | Lehrbetrieb | e.g. **CHF 190 per featured listing per season** or CHF 490 per year profile | Visibility in search. **No access to pupil data**; contact only when the pupil applies |

**Benchmarks:**
- Classtime (Kt. ZH): CHF 975–1,755 per school per year.
- Antolin: €54 per class.
- ANTON: €250–400 per school.
- Paper Berufswahl materials: CHF 15–25 per pupil.
- time2learn: CHF 62–122 per learner.

All our school prices sit far below the freihändig procurement threshold (about CHF 150,000), so a school head or Schulpflege can decide.

**Pilot:** free until the end of the school year 2026/27, as already promised on /schulen. Ask pilot schools what price they would consider fair before fixing the price list. The prices above are **(A) hypotheses**.

## 9. Revenue model

1. **School/class licences (main stream, from Aug 2027):** yearly invoices (QR bill) at the start of the school year. Teacher-led bottom-up sales.
2. **Plus subscriptions (side stream, from spring 2027):** via Stripe (TWINT 1.9% + CHF 0.30, cards 2.9% + CHF 0.30). Peaks in Sep–Mar. Expected conversion 2–4% of active pupils outside licensed classes (A).
3. **Grants and foundations (bridge funding):** e.g. Gebert Rüf Stiftung or the Swiss EdTech Testbed, tied to a pilot evaluation with a teacher-training university (PH). Not recurring.
4. **Framework contracts (year 2+):** one canton or BIZ buying for all schools would be the biggest single lever.
5. **Employer side (year 3+, optional):** only if it doesn't hurt neutrality or trust.

Unit economics (A):
- Variable cost per pupil per year: about 20 AI checks × CHF 0.003 = **CHF 0.06**, plus storage and bandwidth (negligible below 100k MAU on Supabase Pro).
- Gross margin on licences: **>95%** before founder time and support.

## 10. Costs

**Variable cost of one AI check:**
- About 860 input + about 6,400 cache-read + about 4,200–5,500 output tokens.
- Haiku 5.5 prices: $0.10 per million input, $0.01 per million cache read, $0.50 per million output.
- Result: about $0.0027 = **CHF 0.002–0.003 per check**, i.e. 350–500 checks per CHF.
- Budget CHF 0.005 to cover retries and cache writes. 10,000 checks a month ≈ **CHF 25–50**.

**Monthly running costs (CHF):**

| Item | Today (≈5 users) | Year 1 pilot (≤2,000 users) | Year 3 base (≤20,000 users) |
|---|---|---|---|
| Supabase Pro ($25, Micro compute incl.; 100k MAU) | 0–20 | 20 | 20–60 (bigger compute) |
| Netlify (Personal $9 / Pro $20, credits) | 0–7 | 16 | 16–40 |
| Domain wendapply.ch (≈CHF 20 per year) | 2 | 2 | 2 |
| E-mail (Brevo free tier → paid) | 0 | 0–20 | 20–40 |
| AI checks | <1 | 5–25 | 50–150 |
| Monitoring, analytics, helpdesk | 0 | 0–20 | 30–60 |
| **Infra subtotal** | **≈ 5–30** | **≈ 45–100** | **≈ 140–350** |
| Insurance (liability/cyber, CHF 400–1,200 per year) | – | 35–100 | 100 |
| Accounting/Treuhand (CHF 500–1,500 per year) | – | 40–125 | 125 |
| Marketing (print, ads tests, events) | – | 50–150 | 300–800 |
| Travel to schools | – | 50–100 | 100–200 |
| **Total monthly cash cost** | **≈ 5–30** | **≈ 220–575** | **≈ 765–1,575** |

**One-off costs (year 1):**

| Item | CHF |
|---|---|
| Lawyer review of the privacy package, AVV, pilot/licence contract | 1,500–5,000 |
| Security / RLS review (external, 1–2 days) | 1,500–4,000 (optional, before the first licence) |
| Design and material (one-pager, lesson plan, demo video) | 800–2,500 |
| Einzelfirma registration (GmbH later: ~CHF 800–3,500 + CHF 20k capital) | 0–120 |
| Optional: Supabase migration to the Zurich region (own time) | 0 |

**Not included: founder time.** At 10 h per week × CHF 60 per hour (A), that would be about CHF 2,600 per month. Year 1 assumes Panat is unpaid.

## 11. Go-to-market

**Season matters:**
- Companies publish places from **1 August**. Contracts are signed **Sep–Mar** (about 41,000 by end of March, about 54,500 by end of May).
- Schnupperlehren run in grade 8, applications from the end of grade 8 into grade 9.
- Sell to schools for the **next** school year between **Mar and Jun**, onboard in **Aug–Oct**. Communal budgets are set in autumn.

1. **Pilot classes (Dec 2026 – Mar 2027):**
   - 3–5 classes in canton Zürich, from Panat's personal network first, then direct outreach to teachers.
   - Mix of city, agglomeration and rural classes, and at least one Niveau B/C class.
   - Written pilot agreement plus a parent information sheet.
   - Success criteria: ≥60% of pupils with ≥3 entries, ≥2 of 3 teachers want to continue, ≥1 school head asks for a price.
2. **Teachers as champions:**
   - 10-minute demo and a free lesson plan "Lehrstellensuche in 6 Wochen".
   - Referral loop: a class invite brings in pupils, and a teacher recommends colleagues.
   - Teacher associations (LCH, ZLV), and continuing-education courses at PH Zürich and FHNW.
3. **Berufsberatung / BIZ:** position WendApply as the follow-through tool after a BIZ visit, linking to LENA. Ask counsellors which teachers are open to it.
4. **Cantons (from 2027/28):** start with Zürich, then Aargau or St. Gallen. Get listed in **educa Navigator**. Later, connect to **Edulog** for school logins.
5. **Pupils directly (B2C):**
   - TikTok and Instagram short videos ("my letter got 44 → 89 points", rejection stories, island time-lapses).
   - SEO long-tail: "Bewerbung Lehrstelle Muster", "Absage Lehrstelle was tun", "Schnupperlehre Bewerbung".
   - Campaigns in Aug–Nov and Jan–Mar.
   - No ads targeted at under-16s with personal data; organic reach and school channels only.
6. **Events:** visit Berufsmesse Zürich (Nov) and Swissdidac (Nov 2027) as a visitor or with a workshop. A stand only once there is revenue.

## 12. KPIs

| KPI | Definition | Target by Mar 2027 | Target by Nov 2027 |
|---|---|---|---|
| Registered pupils | Accounts with role pupil | 200 | 1,600 |
| **Activation** | ≥3 entries within 14 days of sign-up | ≥50% | ≥50% |
| **WAU** | Pupils with ≥1 action in 7 days | 90 | 800 (in season) |
| Applications logged | Total entries (applications + Schnupperlehren) | 600 | 10,000 |
| AI checks | Checks per month, and average score improvement on a re-check | 300 per month, +10 points | 3,000 per month |
| Retention | Active in week 4 after sign-up | ≥35% | ≥35% |
| Teacher adoption | Teachers with ≥1 class and ≥5 active pupils | 6 | 40 |
| Lehrstelle found | Self-reported "Zusage" | – | 150 |
| **Paid conversion** | Paying schools / Plus conversion among non-licensed actives | 0 / – | 5 schools / 3% |
| Trust | Data-protection incidents; pilots with a signed agreement | 0 / 100% | 0 / 100% |

Measure only with aggregated SQL queries (no personal data in reporting). Review weekly during the season.

## 13. Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Data protection for minors** (cantonal law for schools, revDSG for us; privatim is sceptical of US cloud; the Zürich data protection officer said apps for *monitoring* pupils are not allowed) | High / very high | Pupil-controlled sharing (already built), "support not surveillance" wording; school contract (AVV) as the legal basis; lawyer review; consider moving Supabase to **Zurich (eu-central-2)**; Anthropic: no retention of letter text, pseudonymised input, consent per check (built), a no-AI option for schools |
| **School procurement and budget cycles** | High / high | Prices below thresholds; class licence a teacher can request; free pilot; sell in Mar–Jun for the next school year; foundation funding as a bridge |
| **Seasonality** (usage peaks Aug–Mar, almost none Jun–Jul) | Certain / medium | Annual pricing, not monthly; summer for development; 10th-year/bridge programmes and older applicants use it all year |
| **Search depends on scraping** (Yousty, jobs.ch, jobup.ch may block us or forbid it in their terms) | Medium / medium | Check the terms; rate limits (built); link out instead of copying; ask for official feeds (LENA/SDBB, Yousty partnership); the tracker works without search |
| **AI cost and quality** | Low (cost) / medium (quality) | Cost is negligible (CHF 0.003 per check); daily limits are configurable; eval suite (32/33 clean); disclaimer "AI can be wrong, ask your teacher"; never auto-send letters |
| **One-person team** (bus factor 1, part-time) | High / high | Automated tests and backups, documentation, managed hosting; scope discipline (ZH only in year 1); a second person as emergency contact; buy freelancer hours once revenue exists |
| **Yousty adds AI and a dossier** | Medium / high | Move fast on the teacher/school relationship and neutrality (all sources); possibly partner with Yousty instead of fighting it |
| **Cantons build their own portals** (like St. Gallen) | Medium / medium | Offer WendApply as a white-label or framework option; integrate, don't compete |
| **No willingness to pay** | Medium / high | Test price in the pilot; go/no-go end of June 2027; fallback to a foundation-funded free model |
| **Gamification criticised for minors** | Low / medium | No real-money link to points, no streak pressure, opt-out of social features |

## 14. 12-month roadmap (Dec 2026 – Nov 2027)

| Quarter | Product | Market / business | Gate |
|---|---|---|---|
| **Q1: Dec 2026 – Feb 2027** | AI check live in production (with daily limit); working SMTP mails; fill Impressum TODOs; KPI queries; finish Google login | Lawyer review of the legal package; register an Einzelfirma; **3–5 pilot classes** start in the application peak; 5 BIZ/teacher conversations | **End of Jan:** ≥2 active pilot classes and ≥40% activation, else refocus (bridge programmes/BIZ) |
| **Q2: Mar – May 2027** | Plus tier with Stripe/TWINT; AI help for the Lebenslauf; parent view (consent-based); school-head dashboard (anonymised) | Pilot report with quotes; price interviews; 3 schools with a letter of intent; foundation application (e.g. Gebert Rüf + PH partner); educa Navigator listing | Plus conversion ≥1% of active pupils |
| **Q3: Jun – Aug 2027** | Licence management and invoicing (QR bill); onboarding for new classes; maybe Supabase move to Zurich region | Sell licences for school year 27/28; teacher material update; TikTok/SEO season start in Aug | **End of Jun:** ≥1 school willing to pay, else switch to a foundation/public-funding model |
| **Q4: Sep – Nov 2027** | Improvements from pilot feedback; FR language prep (decision only); Edulog feasibility | **5 paying schools (target)**; second canton pilot (AG or SG); Swissdidac/Berufsmesse presence; year-1 review | Decide: stay a side project, go part-time, or seek a canton/partner deal |

## 15. Financial projection

**Assumptions (A):**
- Pilots are free until Jul 2027, so licence revenue only arrives in Aug–Nov 2027.
- Average school licence about CHF 1,000–1,150.
- Plus at CHF 29 per year.
- Founder time is unpaid.
- Prices exclude VAT; no VAT liability below CHF 100,000 turnover.

**First 12 months (Dec 2026 – Nov 2027), CHF:**

| | Conservative | Base | Optimistic |
|---|---|---|---|
| Registered pupils (end) | 400 | 1,600 | 4,000 |
| Paying schools | 2 × 690 | 5 × 1,000 | 12 × 1,150 |
| School revenue | 1,380 | 5,000 | 13,800 |
| Plus subscribers × 29 | 10 → 290 | 50 → 1,450 | 200 → 5,800 |
| Grants | 0 | 0 | 15,000 |
| **Total revenue** | **1,670** | **6,450** | **34,600** |
| Infra (12 months) | 600 | 900 | 1,500 |
| Legal (one-off) | 1,500 | 3,000 | 5,000 |
| Insurance, accounting | 900 | 1,500 | 2,000 |
| Marketing, material, travel | 1,400 | 3,100 | 4,500 |
| Freelance help (dev/design) | 0 | 0 | 2,000 |
| Reserve | 500 | 500 | 0 |
| **Total costs** | **4,900** | **9,000** | **15,000** |
| **Result** | **−3,230** | **−2,550** | **+19,600** |

**Years 2–3 (school years 2027/28 and 2028/29, rough, CHF):**

| | Conservative | Base | Optimistic |
|---|---|---|---|
| Year 2 revenue | ~8,000 (8 schools + Plus) | ~32,500 (25 schools × 1,100 + Plus 5k) | ~100,000 (1 canton framework ~18k + 60 schools + Plus 15k) |
| Year 2 costs | ~8,000 | ~20,000 | ~60,000 (part-time help) |
| Year 3 revenue | ~17,000 | ~86,000 (60 schools + Plus 12k + employer pilot 5k) | ~250,000 (2 cantons, 150 schools, employer listings) |
| Year 3 costs | ~10,000 | ~45,000 (incl. ~25k part-time dev/support) | ~150,000 (1–2 hires; VAT liable) |

**Reading the numbers:**
- In all scenarios the cash need is small (worst case about CHF 3,000–5,000 out of pocket in year 1).
- Even the base case does not pay a Swiss full-time salary by year 3.
- The **optimistic case depends on one canton or foundation deal**, which is the strategic goal to work towards.

## 16. Next 5 actions for Panat

1. **Approve the AI check going live:** merge `ai-review` into main and deploy to production, with a default daily limit (e.g. 10 checks per pupil). Make sure registration e-mails work (Brevo SMTP + SPF/DKIM).
2. **Book a data-protection lawyer** (budget CHF 1,500–3,000) to review docs/legal (privacy notice for young people, school annex, AVV, deletion concept). Fill in the Impressum TODOs. Decide whether to move Supabase to the Zurich region before the first school signs.
3. **Recruit 3 pilot classes for Jan–Mar 2027:** from your own network first (former teachers, Wendico contacts). Use the 10-minute demo, the pilot agreement and the parent letter in docs/ux-review/roadmap-targets.md.
4. **Set up KPI tracking now:** a weekly aggregated query covering sign-ups, activation, WAU, entries, AI checks and teacher classes. No baseline means no pitch.
5. **Validate price and funding in parallel:**
   - Ask 5 teachers and 2 school heads "what would be a fair yearly price?"
   - Contact the BIZ Zürich and one PH (PH Zürich) about an evaluated pilot.
   - Check the Gebert Rüf / Swiss EdTech Testbed application deadlines.

## Sources

- SBFI/gfs.bern, Nahtstellenbarometer Aug 2025, final report: https://www.sbfi.admin.ch/dam/de/sd-web/j3z3gsAU2wus/253107_Nahtstellenbarometer_Schlussbericht_def_DE.pdf
- SBFI press releases: 28.10.2025 https://www.sbfi.admin.ch/de/newnsb/vi01XsBatKjLWHJgZ6ns_ · 29.10.2026 https://www.sbfi.admin.ch/de/newnsb/ReR-lJGp9h5y · 17.09.2026 https://www.sbfi.admin.ch/de/newnsb/1D3zVMAzyOVo · 15.04.2025 https://www.admin.ch/de/newnsb/q2Gau7XDnEZKcjwnr_DKf · 17.11.2025 https://www.sbfi.admin.ch/de/newnsb/Bi48pNeH01vsTuQx-M0WJ
- EHB release 10.11.2026 (training companies, fill rates): https://www.admin.ch/de/newnsb/0rBApxRHM9oU
- BFS Statistisches Jahrbuch 2024, ch. 15 (Sek-I pupils, schools): https://dam-api.bfs.admin.ch/hub/api/dam/assets/33027220/master
- Statista/BFS Sek-I pupils 2023/24: https://de.statista.com/statistik/daten/studie/306874/umfrage/schueler-in-der-obligatorischen-schule-in-der-schweiz
- Class size: https://www.statistikportal.li/de/publikation/bildungsindikatoren-2023/2023/01/v-1/p25079/pdf
- Commitment Berufswahlprozess (timing): https://edudoc.ch/record/222190/files/Commitment_Berufswahlprozess_Lehrstellenbesetzung.pdf?version=1
- SK BSLB statistics 2024: https://edudoc.ch/record/241490/files/SKBSLB_Statistikbericht_2024.pdf
- Yousty: FAQ https://www.yousty.ch/de-CH/help · Jahresrückblick 2024 https://cf-images.yousty.ch/pages%2F613%2Fdocuments%2F7c49d59ab1940e7a297589673f4073aa%2FMedienmitteilung_I_Jahresruckblick_I_2024.pdf
- berufsberatung.ch / LENA: https://www.berufsberatung.ch/dyn/show/201837
- Berufswahl-PortalSG: https://www.sg.ch/bildung-sport/berufsbildung/Berufswahl-PortalSG.html
- gateway.one: https://www.gateway.one
- JobCloud apprenticeship ads: https://b2b.jobcloud.ch/apprenticeship-job-ads
- Kickresume pricing: https://www.kickresume.com/en/pricing/
- Azubiyo, Ausbildung.de, Azubi.de (Betterteam): https://www.betterteam.com/de/die-besten-ausbildungsportale
- Supabase pricing and regions: https://supabase.com/pricing · https://supabase.com/docs/guides/platform/regions
- Netlify pricing: https://www.netlify.com/pricing/
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- privatim cloud guidance v3.02: https://www.ag.ch/media/kanton-aargau/dvi/dokumente/ges/organisation/idag/datenschutz/privatim-cloud-merkblatt-v3-02-20261002-def-de.pdf
- educa app checklist: https://www.educa.ch/sites/default/files/2024-06/Applikationscheckliste_de_0.pdf · Edulog: https://www.educa.ch/en/topics/digital-identity
- Zürich Volksschule data protection and AI: https://www.zh.ch/de/bildung/informationen-fuer-schulen/informationen-volksschule/volksschule-organisation/volksschule-datenschutz-archivierung.html · https://www.zh.ch/de/bildung/informationen-fuer-schulen/informationen-volksschule/volksschule-schulinfo-unterricht/kuenstliche-intelligenz.html
- Zürich data protection officer on monitoring apps (2020): https://www.netzwoche.ch/news/2020-06-09/diese-homeoffice-dienste-empfiehlt-die-zuercher-datenschutzbeauftragte
- Classtime licence (Kt. ZH): https://help.mba.zh.ch/images/DigitaleLeistungserhebung/SK_ES_2024_073_DLEClasstime.pdf
- Antolin prices: https://antolin.westermann.de/all/downloads/antolin_ppt.pdf?v=2023 · ANTON school licence: https://moodle.lmz-bw.de/pluginfile.php/49331/mod_label/intro/ANTON-Admins-Schullizenz-Startanleitung-BW-2023-02-08.pdf
- time2learn price list: https://kibesuisse.ch/fileadmin/Dateiablage/kibesuisse_Dokumente/time2learn_Preisliste_DE.pdf
- Stripe CH pricing: https://stripe.com/ch/pricing · https://stripe.com/ch/pricing/local-payment-methods
- ESTV VAT FAQ: https://www.estv.admin.ch/de/fragen-und-antworten-mwst
- GmbH formation cost: https://www.postfinance.ch/de/blog/business-blog/was-kostet-eine-unternehmensgruendung.html
- Internal: docs/ai-review/README.md, docs/p0-release.md, docs/teacher-contract.md, docs/legal/, docs/islands.md, docs/map-shop.md, docs/ux-review/gtm-strategy.md, docs/ux-review/schools-landscape.md, docs/ux-review/roadmap-targets.md, vault note "Bewerbungen Tracker" (cost per AI check, user count).
