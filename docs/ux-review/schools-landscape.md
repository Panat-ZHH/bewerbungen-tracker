# Part B(4) – Swiss school landscape, procurement, data protection, Berufswahl

Research date: 2026-11-06. Method: WebSearch plus page reads. Many official PDFs could not be read, so several points are secondary-source or background knowledge. These are marked **(unsicher)**. This is not legal advice. Before the first school contract, have a Swiss lawyer or data protection adviser check the points that matter.

## 0. Key takeaways for WendApply

1. **Schools do not buy "a Swiss school system".** They buy from about 26 cantonal systems, and below that from communes, school boards and school heads. The right entry point depends on the school type (see section 2).
2. **Small amounts do not need a tender.** For cantons and communes under IVöB 2019, supplies and services below roughly CHF 150'000 (freihändig) or CHF 250'000 (Einladungsverfahren) need no open tender (secondary source, unsicher, section 3). A per-school licence of a few thousand CHF is far below that. Cumulative or framework contracts are a risk, though.
3. **Data protection is the real gate, not procurement.** The privatim resolution of Nov 2025 (as reported) takes a hard line against US cloud/SaaS for sensitive public-sector data, and education data is explicitly listed in the press coverage. WendApply runs on Supabase and Netlify (both US companies, possibly with EU/CH hosting regions). Expect the question "where is the data and who can access it?" in every school conversation. The question needs a precise, honest answer (section 4 and 5).
4. **Dependence on school tools:** the student side works without integration (students sign up themselves). Integration with Klapp, schulNetz, Edulog or Microsoft 365 is not needed at the start, but SSO is a nice-to-have for later (section 7).

## 1. School landscape: types and numbers

### 1.1 Education system in short
- Education is mainly a cantonal responsibility (26 cantons, each with its own education directorate: Bildungsdirektion / Erziehungsdirektion / Departement für Bildung, name varies). Vocational education is shared between the Confederation (SBFI) and the cantons. Source: general knowledge, supported by a search result describing the split ([zh.ch Bildung](https://www.zh.ch/de/bildung/schulen.html)).
- Coordination across cantons: EDK (Swiss conference of cantonal education directors), HarmoS concordat, Lehrplan 21 (German-speaking cantons), PER (French), Piano di studio (Ticino). Details unsicher, background knowledge.

### 1.2 Student numbers (BFS)
- **About 1'031'600 learners in compulsory school in 2024/25** ([BFS, Obligatorische Schule](https://www.bfs.admin.ch/bfs/de/home/statistiken/bildung-wissenschaft/personen-ausbildung/obligatorische-schule.html); read through a summary, please verify on the live page). That is about 13% more than in 2010/11.
- Sekundarstufe I (Oberstufe) share: BFS page says about 28%, which gives roughly **290'000 Sek-I learners** (my own arithmetic, not a published figure, unsicher).
- **Sekundarstufe II: about 375'900 persons in 2024/25** (BFS headline summary in the search result, unsicher on the exact scope). This covers Gymnasien, Fachmittelschulen, Berufsbildung (EFZ/EBA) and others. I did not find a separate apprentice count.
- BFS published the detailed basic tables "Lernende 2024/25" on 26.02.2026, including learners by canton and school type ([BFS table](https://statistik.admin.ch/de/asset/36430030)). Not opened.
- **Number of schools:** no reliable national figure found. Do not quote one. The BFS institutions page ([Bildungsinstitutionen](https://www.bfs.admin.ch/bfs/de/home/statistiken/bildung-wissenschaft/bildungsinstitutionen.html)) is the place to look.
- Canton examples for scale: Freiburg 49'035 pupils 2024/25 ([fr.ch](https://www.fr.ch/de/bkad/news/etwas-mehr-als-49-000-schuelerinnen-und-schueler-an-den-freiburger-schulen)), Basel-Stadt about 18'520 ([bs.ch](https://www.bs.ch/medienmitteilungen/ed/2024-erster-primarschul-tag-fuer-1720-buben-und-maedchen)), Basel-Landschaft about 34'546 ([baselland.ch](https://www.baselland.ch/politik-und-behorden/direktionen/finanz-und-kirchendirektion/daten-statistik/abteilung-statistik/publikationen-und-statistiken/bildung/webartikel-vom-25-06-2025-statistik-der-lernenden-2024)).

### 1.3 School types relevant to WendApply
| Type | Typical age | Relevance |
|---|---|---|
| Oberstufe / Sekundarschule (Sek I, 7th–9th class; levels A/B/C or Real/Sek/Prosek vary by canton) | 13–16 | **Core target group**: apprenticeship search happens here (8th–9th class). |
| 10. Schuljahr / Brückenangebote (Motivationssemester, Berufsvorbereitungsjahr, Integrationsklassen) | 15–18 | Strong fit: students without an apprenticeship contract. High need, usually coached by Case Managers. Details per canton unsicher. |
| Gymnasium / Fachmittelschule | 15–19 | Weaker fit (university path), but some apply for apprenticeships or FMS-related roles. |
| Berufsfachschule (BFS) | 15–20 | Already in apprenticeship. Relevant for the next step (job after EFZ, Berufsmaturität, Weiterbildung). Matches the profile of the product owner (EFZ + BM). |
| Berufsberatung / BIZ | all | Not a school but the key multiplier in every canton (section 6). |

## 2. Who decides about digital tools?

Honest summary: **it differs per canton and often per commune.** The table lists what I could confirm and what is unsicher. Fine-grained detail would need canton-by-canton research (not done).

| Level | Typical role | Relevance |
|---|---|---|
| Teacher | Often free to use tools "in class" if no personal data of pupils is entered or consent exists. Many cantons restrict this. | Fast pilot route, but legally fragile. Do not rely on it. |
| Schulleitung | Day-to-day operations; chooses apps within budget. A 2013 SRF piece says Schulleitungen run the daily business ([SRF](https://www.srf.ch/news/schweiz/schulpflege-ein-auslaufmodell), old source). | Main contact for a pilot. |
| Schulpflege / Schulkommission / Gemeinderat | Strategic and financial authority at commune level (older source, 2013; several cantons abolished or reduced the Schulpflege, e.g. Solothurn). Zürich, St. Gallen and Thurgau kept it at that time. | Decides on budget and contracts above the head's competence. |
| Kanton (Volksschulamt / Amt für Volksschule, Mittelschul- und Berufsbildungsamt) | Curriculum, approved Lehrmittel, sometimes ICT base service and framework contracts. For Sek II (Gymnasien, Berufsfachschulen) the canton is usually the school owner, so decisions are more centralised. | Zürich Sek II has a cantonal ICT base provision ([Factsheet IKT Sek II, MBA ZH](https://diwasekll.mba.zh.ch/images/factsheet_ikt-sek-ii.pdf)). |
| Datenschutzbeauftragte(r) | Prior check for projects with special risks, guidance on cloud/SaaS (section 4). | Can block or approve. |
| Educa / Edulog | Educa (Swiss Education Server) negotiated framework contracts with Microsoft; Edulog is the federated school login ([Edulog Bericht](https://edudoc.ch/record/227099/files/PB271022-Edulog-DE.pdf)). | Possible route to listing later. |

Canton notes (all **unsicher**, based on background knowledge, not verified in this research): Zürich has a Lehrmittelverlag as cantonal publisher and a Volksschulamt that publishes guidance; Bern has the BIZ network and the "Berufswahldossier"; Aargau publishes cloud guidance for schools ([Merkblatt Cloud Computing in Schulen, AG](https://www.ag.ch/media/kanton-aargau/dvi/dokumente/ges/organisation/idag/merkblaetter/merkblatt-cloud-computing-in-schulen.pdf), dated 2013, outdated); St. Gallen and Luzern not researched.

**Recommendation:** start with Sek-II / Brückenangebote / Oberstufen of communes with an active Schulleitung and one friendly head, and treat each canton's Datenschutzbeauftragte as a stakeholder to inform early.

## 3. Procurement (Submissionsrecht)

- Legal base: IVöB 2019 (Interkantonale Vereinbarung über das öffentliche Beschaffungswesen), now adopted by most cantons. Zürich joined, in force since **1 Oct 2023** ([zh.ch Hilfsmittel](https://www.zh.ch/de/politik-staat/kanton/kantonale-verwaltung/beschaffung-einkaeufe/hilfsmittel-beratung.html)). St. Gallen has new procurement law 2023 ([sg.ch](https://www.sg.ch/recht/beschaffungswesen/neues_beschaffungsrecht_2023.html)). Each canton may have its own details (unsicher).
- Procedures: offenes, selektives, Einladungs- and freihändiges Verfahren.
- **Thresholds, cantons and communes outside the treaty area** (as printed by a secondary source, [Tenderlift](https://tenderlift.ch/blog/wto-thresholds-2026/), valid 1.1.2026–31.12.2027, **not verified against the official BPUK annex**):
  - Lieferungen: freihändig < CHF 150'000; Einladungsverfahren < CHF 250'000; open/selective from CHF 250'000.
  - Dienstleistungen: same as Lieferungen.
  - Bauhauptgewerbe: < 300'000 / < 500'000; Baunebengewerbe: < 150'000 / < 250'000.
  - Staatsvertragsbereich (WTO GPA), cantons/communes: supplies and services from CHF 350'000.
- For a software licence: whether it counts as "Lieferung" or "Dienstleistung", the thresholds are the same. For typical school subscriptions (some hundred to a few thousand CHF per year) a freihändige Vergabe is the normal route. Some cantons require offers from several suppliers even below the threshold, and communes may set stricter internal rules (unsicher).
- Pitfalls: contract value is calculated over the whole duration (including renewals), and a canton-wide rollout may exceed the thresholds quickly. Splitting contracts to avoid thresholds is not allowed (general rule, unsicher on details).
- **Free pilots:** a free pilot avoids procurement, but data protection rules still apply in full.

## 4. Data protection

### 4.1 Which law applies?
- **Public bodies (public schools) in cantons/communes are governed by cantonal data protection laws** (e.g. Zürich IDG, § 6 IDG for processing on behalf, § 25 IDV), not by the federal nDSG. The federal nDSG (in force 1 Sep 2023) applies to private persons and federal bodies. Source for Zürich: [Leitfaden Bearbeiten im Auftrag (DSB ZH)](https://docs.datenschutz.ch/u/d/publikationen/leitfaeden/leitfaden_bearbeiten_im_auftrag.pdf) (the link name suggests a federal document; the search result describes it as Zürich guidance, unsicher). WendApply itself, as a private company, is also subject to the nDSG. In practice both apply.
- Cantonal rules for processing on behalf (Auftragsbearbeitung): written contract, the school stays responsible, provider may only process on instruction, security measures, rules for sub-processors and for transfers abroad. Commercial pages cite Art. 9 nDSG for this (unsicher, not a legal text).
- **DSFA / Vorabkontrolle:** nDSG Art. 22 requires an impact assessment for high-risk processing (my background knowledge, not verified in the search). Zürich requires prior checking for projects with particular risks to personality rights ([Netzwoche interview with DSB ZH, 2023](https://www.netzwoche.ch/news/2023-09-27/das-sagt-die-zuercher-datenschutzbeauftragte-zur-microsoft-cloud)). Application data of minors (CVs, career wishes, rejections) is likely to be treated as "sensitive enough" to trigger such a check at least in some cantons (unsicher).

### 4.2 Cloud and SaaS guidance
- privatim (conference of cantonal data protection officers) has a "Merkblatt Cloud-spezifische Risiken und Massnahmen" used as the reference by cantons (named in [Netzwoche, 2023](https://www.netzwoche.ch/news/2023-09-27/das-sagt-die-zuercher-datenschutzbeauftragte-zur-microsoft-cloud)). I could not open the current version. The Aargau school Merkblatt cited is from 2013 and out of date.
- **Resolution of privatim, Nov 2025 (outsourcing of data processing to the cloud):** per [Techzine, 1 Dec 2025](https://www.techzine.eu/news/infrastructure/136832/switzerland-no-longer-wants-american-cloud-in-the-public-sector) the position is that US hyperscaler SaaS (Microsoft, Amazon, Google) should not be used for sensitive data under professional/official secrecy, listed as including education data. Encryption counts only if the provider has no key access and data stays encrypted during processing, which SaaS usually cannot meet. A Solothurn government decision treats the resolution as an important orientation aid ([RRB SO 2026/752](https://rrb.so.ch/beschlussnummer/2026_752/download/984a613a0f5641028160efbc772f3be3/)). **Caveat:** Techzine is secondary and partly inconsistent (e.g. wrong names). Read the original on privatim.ch before relying on this.
- Zürich's DSB (2023): cloud use is no blanket permission; confidential data must not be accessible to third parties; the canton uses Microsoft 365 but does not process confidential data there.
- Microsoft 365 in education: privatim obtained contract changes in 2014 ([Netzwoche](https://www.netzwoche.ch/news/2014-03-20/privatim-ringt-microsoft-zugestaendnisse-ab)); Zürich Sek II offers Office 365 in its ICT base provision. After the 2025 resolution this is contested. Status per canton unsicher.

**What this means for WendApply:** WendApply is a SaaS on Supabase and Netlify, US-owned companies. Even with an EU/CH region, the CLOUD Act argument applies in the privatim logic. A school's Datenschutzbeauftragte could therefore refuse approval if the school enters or requires sensitive data. Mitigations:
1. **Data minimisation:** students sign up themselves with their own email, no school roster upload, no grades, no health or residence-status data. Position the tool as "student's own tool" rather than "school system".
2. Check the Supabase region (eu-central / Zürich if available) and Netlify data handling, and state it exactly (section 5).
3. Offer a documented option: teacher sees only what the student chooses to share (consent-based sharing by the student).
4. Consider for the longer term: Swiss/EU-only hosting or self-hosting for school customers (cost to be weighed).

### 4.3 Minors, consent, parents
- No fixed age in Swiss law. A minor can consent alone if **urteilsfähig** (capable of judgment) for the specific act, in practice usually from about 12–14 (background knowledge, **unsicher**, no source found in this run). For 14–16-year-olds in 8th/9th class, a purely student-signed consent is legally grey. Schools often ask for parental consent for services outside the curriculum.
- For public bodies, the school may process data on a legal basis for its tasks (Berufswahl is a school task under LP21), which can replace consent. But a third-party tool chosen by a teacher usually lacks that basis. Therefore a school should sign a contract, or students/parents consent individually. Both paths should be supported.
- A Zürich example shows sensitivity: the Stadt Zürich school database collected pupil data without parental consent and one school district stopped it ([Beobachter](https://www.beobachter.ch/bildung/datenschutz-wirbel-um-neue-datenbank-der-stadtzurcher-volksschule), date unclear).
- Practical product consequences: age gate at sign-up, simple parent information sheet (PDF) as template, plain-language privacy text for 13–16-year-olds, and no marketing use of student data.

## 5. Checklist: what WendApply must provide to schools

| # | Item | Status/notes |
|---|---|---|
| 1 | **Datenschutzerklärung** (DE, in plain language, plus a youth-friendly short version) | Must name controller, purposes, data categories, retention, rights, sub-processors, countries. |
| 2 | **AVV / DPA** (Vertrag über die Bearbeitung im Auftrag), Swiss-law based, signable by Schulgemeinde/Kanton | Instruction-bound processing, confidentiality, security, sub-processor list with notice, audit right, return/deletion, breach notification, data location. |
| 3 | **Data location statement** | Exact Supabase project region and Netlify behaviour (CDN edge, logs). Do not claim "Swiss hosting" unless true. State US-parent exposure honestly. |
| 4 | **Sub-processor list** | Supabase (database, auth), Netlify (hosting/CDN), Google (what exactly? sign-in, Gmail/Calendar integration or fonts – clarify what the app uses and avoid unnecessary Google calls), plus email provider, error tracking, analytics if any. |
| 5 | **Deletion and export** | Student can delete account and export data (delete-account branch exists); teacher/school offboarding: deletion on contract end within a stated number of days. State backup retention. |
| 6 | **Security statement** | Transport encryption, encryption at rest, row-level security in Supabase, access roles (student/teacher), logging, backups, incident process, who has admin access. A penetration test or at least a documented self-review. |
| 7 | **Accessibility statement** | Target WCAG 2.1 AA, honest known gaps (the three.js map is a risk for screen readers/keyboard use – see other review parts). Swiss reference: eCH-0059 / Behindertengleichstellungsgesetz (unsicher). |
| 8 | **Data minimisation description** | Data fields list, no data from the school system, no grades. |
| 9 | **Role and sharing model** | What a teacher can see, only with student consent, audit trail. |
| 10 | **Pupil/parent information sheet and consent template** | One page, DE; optional FR/IT later. |
| 11 | **DSFA starter** | Pre-filled risk assessment the school can attach to its own DSFA/Vorabkontrolle. |
| 12 | **Company facts** | Legal entity, Swiss address, contact for data protection, insurance, support/response times, price list, termination. |
| 13 | **Pricing for freihändig range** | Per-school annual price clearly below the thresholds in section 3. |

Items 1–6 are the minimum before any school pilot with real students. Everything above that can follow when a school asks.

## 6. How Berufswahl is organised

- **LP21 module "Berufliche Orientierung"** (8th grade main focus, in Zürich a weekly lesson in 8th class). Competence areas as summarised by the canton of Schaffhausen: personality profile, educational paths, decision-making and dealing with difficulties ([Schaffhausen, PDF](https://schule.sh.ch/CMS/get/file/e4786d9d-7b54-4311-be90-75b603b4f94f), via search snippet, unsicher). Zürich 8th-class lesson: from a search snippet, unsicher.
- **BIZ (Berufsinformationszentren)** are cantonal. In Bern, the BIZ offers a *Berufswahldossier* with ten chapters and a model school concept: class and parent orientation at the BIZ in autumn of 8th grade (calendar weeks 33–38), location talks in 8th grade, and further dates in spring (KW 6–14) ([BIZ Bern, Berufswahldossier](https://www.biz.bkd.be.ch/content/dam/biz_bkd/dokumente/de/themen/berufswahl-und-ausbildungswege/informationen-fuer-schulen/berufswahldossier.pdf), [Musterkonzept](https://www.biz.bkd.be.ch/content/dam/biz_bkd/dokumente/de/themen/berufswahl-und-ausbildungswege/informationen-fuer-schulen/musterkonzept-berufliche-orientierung-schulen.docx); the .docx itself could not be read, only the search snippet).
- **Schnupperlehre:** possible from 8th class in Solothurn ([so.ch](https://so.ch/verwaltung/finanzdepartement/personalamt/berufliche-grundbildung/lehrberufe-1/schnuppern-beim-kanton-solothurn/)); Obwalden permits it from 9th class with justification (snippet from ow.ch, unsicher).
- **Typical timeline (generalised, cantons differ, unsicher):**

| School year | What happens |
|---|---|
| 7th class | First topics: interests, strengths. Mostly light. |
| 8th class (autumn–spring) | Main Berufswahl work: BIZ visit, Berufswahldossier, interest tests, first Schnupperlehren, parent evening. |
| 8th class end – 9th class autumn | Peak of Schnupperlehren; first applications; many companies open positions from the summer before the start year or earlier. |
| 9th class (autumn–winter) | Applications and interviews; many contracts signed between autumn and spring, some "end of school year or start of 9th class" per one source, which is earlier than my background expectation (unsicher). |
| 9th class spring–summer | Remaining places, fallback solutions, Brückenangebote registration (10th year, Motivationssemester). |
| After 9th class | Start of apprenticeship, or Brückenangebot. |

**Implication for WendApply:** the strongest usage window is from the 8th-class autumn to the 9th-class spring. A school pitch should be timed to the start of the school year (August to October) and tied to the existing Berufswahldossier, not compete with it. The Brückenangebote have the highest need all year round.

## 7. Existing school tools and portals

| Tool | What it is | Source/confidence |
|---|---|---|
| **Klapp** | Swiss school–parent communication app (SaaS). Acquired by CMI in Aug 2022, the reports named about 750 schools ([IT Reseller](https://www.itreseller.ch/Artikel/96745/CMI-Gruppe_uebernimmt_Schulkommunikations-Anbieter_Klapp.html), [Netzwoche](https://www.netzwoche.ch/news/2022-08-17/klapp-schliesst-sich-cmi-an)). Figure from 2022, may be outdated. | Fairly reliable for 2022. |
| **schulNetz** | School administration software used by schools (confirmed only through a job ad from a Basel-area school). Vendor and spread not verified. | unsicher. |
| **CMI Schule / iCampus** | School administration (CMI took over Campus Software in 2022). | From the Klapp coverage, unsicher on details. |
| **Moodle** | LMS, widely used in Sek II and universities. Spread in Volksschule unverified. | unsicher, background knowledge. |
| **Microsoft 365 / Google Workspace** | Common in schools (Educa framework contracts for Microsoft; Zürich Sek II provides Office 365). Under pressure from privatim (section 4.2). | Partly sourced. |
| **Edulog** | Federation of school identities (EDK decision 2019). Basel-Landschaft connected all cantonal Sek I and II schools in Aug 2024 ([BL](https://www.baselland.ch/politik-und-behorden/direktionen/bildungs-kultur-und-sportdirektion/medienmitteilungen/anschluss-an-edulog-fuer-alle-kantonalen-schulen)); 11 identity services from 9 cantons were connected at the end of 2024 ([Edulog Bericht](https://edudoc.ch/record/227099/files/PB271022-Edulog-DE.pdf)). Newer status not found. | Fairly reliable to 2024. |
| **SWITCH edu-ID** | Login for universities and research; MFA mandatory from Sept 2025 at least at some universities. Not the school login; relation to Edulog unclear in my sources. | unsicher for schools. |
| **Federal e-ID (swiyu)** | Approved by vote 28 Sep 2025, launch delayed (sources disagree: 2026 or December). Separate from school logins. | Reported by biometricupdate, unsicher. |

**Implications:** do not build integrations first. A later Edulog connection would be the natural SSO path for schools (and gives a privacy-friendly pseudonymous identity), but requires partner admission (effort and conditions unknown). The cheapest bridge is a CSV/link-based "class code" join without sending school data to WendApply.

## 8. Open questions and next research steps

1. Read the **original privatim resolution (Nov 2025)** and the current privatim cloud Merkblatt; they decide the hosting strategy.
2. Ask one cantonal Datenschutzbeauftragte (Zürich or Bern) for an informal view on a student-owned application tool with optional teacher sharing.
3. Verify procurement thresholds against **BPUK Anhang 1/2** and the commune's own rules.
4. Verify the Berufswahl timelines in **three cantons** (BE, ZH, AG) from their BIZ documents.
5. Confirm what Google services WendApply actually calls (sub-processor list item 4).
6. Find out Edulog partner conditions and costs.
7. Get the number of Oberstufen, Brückenangebote and Berufsfachschulen from BFS institution tables, for the targeting plan.

## Sources used
- [BFS Obligatorische Schule](https://www.bfs.admin.ch/bfs/de/home/statistiken/bildung-wissenschaft/personen-ausbildung/obligatorische-schule.html) · [BFS table 2024/25](https://statistik.admin.ch/de/asset/36430030)
- [Tenderlift thresholds 2026/27](https://tenderlift.ch/blog/wto-thresholds-2026/) (secondary) · [zh.ch Beschaffung](https://www.zh.ch/de/politik-staat/kanton/kantonale-verwaltung/beschaffung-einkaeufe/hilfsmittel-beratung.html) · [sg.ch](https://www.sg.ch/recht/beschaffungswesen/neues_beschaffungsrecht_2023.html)
- [Techzine on privatim resolution](https://www.techzine.eu/news/infrastructure/136832/switzerland-no-longer-wants-american-cloud-in-the-public-sector) (secondary) · [RRB Solothurn 2026/752](https://rrb.so.ch/beschlussnummer/2026_752/download/984a613a0f5641028160efbc772f3be3/) · [Netzwoche DSB ZH interview](https://www.netzwoche.ch/news/2023-09-27/das-sagt-die-zuercher-datenschutzbeauftragte-zur-microsoft-cloud) · [Netzwoche 2014 privatim/Microsoft](https://www.netzwoche.ch/news/2014-03-20/privatim-ringt-microsoft-zugestaendnisse-ab) · [AG Merkblatt Cloud 2013](https://www.ag.ch/media/kanton-aargau/dvi/dokumente/ges/organisation/idag/merkblatt-cloud-computing-in-schulen.pdf) (note: path as returned by search: `.../merkblaetter/merkblatt-cloud-computing-in-schulen.pdf`)
- [Beobachter on Zürich school database](https://www.beobachter.ch/bildung/datenschutz-wirbel-um-neue-datenbank-der-stadtzurcher-volksschule)
- [BIZ Bern Berufswahldossier](https://www.biz.bkd.be.ch/content/dam/biz_bkd/dokumente/de/themen/berufswahl-und-ausbildungswege/informationen-fuer-schulen/berufswahldossier.pdf) · [SO Schnuppern](https://so.ch/verwaltung/finanzdepartement/personalamt/berufliche-grundbildung/lehrberufe-1/schnuppern-beim-kanton-solothurn/)
- [IT Reseller Klapp/CMI](https://www.itreseller.ch/Artikel/96745/CMI-Gruppe_uebernimmt_Schulkommunikations-Anbieter_Klapp.html) · [Netzwoche Klapp](https://www.netzwoche.ch/news/2022-08-17/klapp-schliesst-sich-cmi-an) · [Edulog Bericht](https://edudoc.ch/record/227099/files/PB271022-Edulog-DE.pdf) · [BL Edulog](https://www.baselland.ch/politik-und-behorden/direktionen/bildungs-kultur-und-sportdirektion/medienmitteilungen/anschluss-an-edulog-fuer-alle-kantonalen-schulen) · [SRF Schulpflege 2013](https://www.srf.ch/news/schweiz/schulpflege-ein-auslaufmodell)
