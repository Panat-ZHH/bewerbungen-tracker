# Fixtures for the Ort-Suche tests

Real responses of the sources, fetched once on 2026-11-11 exactly like the app does (GET, User-Agent `WendApply/1.0`, robots.txt respected) and reduced to what the parsers read (title, listing cards, `rel="next"`, the structured `locations` of the embedded jobs.ch state). Scripts, styles, images and tracking were removed. Tests never touch the network.

| File | Request | Why |
|---|---|---|
| `yousty-place-winterthur-p1.html` | `yousty.ch/de-CH/lehrstellen/ZH/Winterthur/1712-informatiker-in-efz` | the old place page: 10 listings from Dübendorf, Glattbrugg, Uster, Zürich … (Yousty's own 14 km circle, not sorted by distance); its `rel="next"` needs `coordinates`/`distance`, which robots.txt forbids |
| `yousty-place-winterthur-p2.html` | same with `?page=2` (as the old code asked) | a result page without a single listing – the old code reported it as "Ergebnisseite konnte nicht gelesen werden" |
| `yousty-canton-zh-p1.html` | `yousty.ch/de-CH/lehrstellen/ZH/1712-informatiker-in-efz` | canton page used now; plain `?page=N` paging |
| `jobs-informatiker-lehrstelle-p1.html` | `jobs.ch/de/stellenangebote/?term=Informatiker Lehrstelle` | 20 listings incl. "Rothenburg / Luzern", an empty Arbeitsort with the place in the company ("Loomis Schweiz AG Kloten"), apprenticeships published as "Festanstellung" |
| `jobs-informatiker-lehrstelle-winterthur-empty.html` | same with `&location=Winterthur` | jobs.ch matches the exact place only: 0 hits, title "Keine … Jobs in Winterthur" |
| `jobs-informatiker-winterthur-frauenfeld.html` | `…?term=Informatiker&location=Winterthur&location=Frauenfeld` | several `location` parameters are combined (8 + 2 hits) |
