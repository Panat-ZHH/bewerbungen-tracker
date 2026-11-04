#!/usr/bin/env node
/**
 * Responsive audit for WendApply (Bewerbungen Tracker).
 *
 * Starts the app (production build + start by default, or `--dev`), mocks ALL Supabase traffic
 * (no real keys, no remote calls) with German fixtures incl. very long names, and visits every route at
 * every viewport in light + dark mode. For each page it takes a screenshot and runs DOM checks:
 *   overflow-x, clipped/wider-than-viewport elements, tap targets < 44px (phones), inputs < 16px (phones),
 *   fixed/sticky bars covering content, modals taller than the viewport, map touch behaviour.
 * Output: docs/responsive-audit.md (human), docs/responsive-audit.json (machine), screenshots.
 *
 * Usage: node scripts/responsive-audit.mjs [--phase before] [--routes /map,/friends] [--widths 320,375]
 *        [--themes light,dark] [--base http://localhost:3000 (use running server)] [--dev] [--port 3150]
 *        [--out <screenshot root>] [--no-shots] [--no-modals]
 * Needs `playwright-core` (resolved from ./node_modules, else ../audit-tools/node_modules) and a Chromium.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); if (i < 0) return def; const v = argv[i + 1]; return !v || v.startsWith("--") ? true : v; };
const PHASE = arg("phase", "before");
const PORT = Number(arg("port", 3150));
const SHOT_ROOT = arg("out", path.join(os.homedir(), "Projects/bewerbungen-tracker-wt/screenshots/responsive"));
const SHOT_DIR = path.join(SHOT_ROOT, PHASE);
const SHOTS = !argv.includes("--no-shots");
const MODALS = !argv.includes("--no-modals");
const SUPABASE_URL = "http://localhost:54321"; // dummy; every request to it is fulfilled by the mock below

// ---------------------------------------------------------------------------------------------- matrix
const VIEWPORTS = [
  { w: 320, h: 640, phone: true }, { w: 360, h: 740, phone: true }, { w: 375, h: 812, phone: true },
  { w: 390, h: 844, phone: true }, { w: 430, h: 932, phone: true },
  { w: 667, h: 375, phone: true, land: true }, { w: 844, h: 390, phone: true, land: true },
  { w: 768, h: 1024 }, { w: 820, h: 1180 }, { w: 1024, h: 768 }, { w: 1280, h: 800 },
].map((v) => ({ ...v, name: v.land ? `${v.w}x${v.h}` : `${v.w}` }));

/** [name, path, role, authed, group, page source file] */
const ROUTES = [
  ["root", "/", "student", false, 1, "app/page.tsx"],
  ["login", "/login", "student", false, 1, "app/login/page.tsx"],
  ["dashboard", "/dashboard", "student", true, 1, "app/dashboard/page.tsx"],
  ["applications", "/applications", "student", true, 1, "app/applications/page.tsx"],
  ["applications-new", "/applications/new", "student", true, 1, "app/applications/new/page.tsx"],
  ["applications-detail", "/applications/a1", "student", true, 1, "app/applications/[id]/page.tsx"],
  ["map", "/map", "student", true, 1, "app/map/page.tsx"],
  ["profile", "/profile", "student", true, 1, "app/profile/page.tsx"],
  ["settings", "/settings", "student", true, 3, "app/settings/page.tsx"],
  ["cvs", "/cvs", "student", true, 3, "app/cvs/page.tsx"],
  ["search", "/search", "student", true, 3, "app/search/page.tsx"],
  ["analytics", "/analytics", "student", true, 3, "app/analytics/page.tsx"],
  ["friends", "/friends", "student", true, 2, "app/friends/page.tsx"],
  ["invite", "/invite/LENA-4821", "student", true, 2, "app/invite/[code]/page.tsx"],
  ["invite-loggedout", "/invite/LENA-4821", "student", false, 2, "app/invite/[code]/page.tsx"],
  ["classes-student", "/classes", "student", true, 2, "app/classes/page.tsx"],
  ["classes-teacher", "/classes", "teacher", true, 2, "app/classes/page.tsx"],
  ["classes-detail-teacher", "/classes/c1", "teacher", true, 2, "app/classes/[id]/page.tsx"],
  ["classes-join", "/classes/join/KLAS-7Q2", "student", true, 2, "app/classes/join/[code]/page.tsx"],
];

// ---------------------------------------------------------------------------------------------- fixtures
const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const mkSession = (role) => {
  const name = role === "teacher" ? "Herr Dr. Bernhard-Maximilian Keller-Schwarzenbach" : "Lena Müller-Hohenegger-Wartenfels";
  const user = { id: role === "teacher" ? "t1" : "u1", aud: "authenticated", role: "authenticated", email: `${role}@beispiel.ch`, user_metadata: { role, full_name: name }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  return { name, user, session: { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user } };
};
const WHO = { student: mkSession("student"), teacher: mkSession("teacher") };
const APPS = [
  ["a1", "Swisscom (Schweiz) AG", "Applikationsentwickler:in EFZ mit Schwerpunkt Plattformentwicklung und Betriebsoptimierung", "Zürich-Oerlikon", "interview", "software", 0],
  ["a2", "UBS Business Solutions AG", "Praktikum Finanzdienstleistungen", "Zürich", "applied", "finance", 5],
  ["a3", "Migros-Genossenschafts-Bund Informationstechnologiedienstleistungen", "Informatikerin EFZ Fachrichtung Applikationsentwicklung", "Bern", "preparing", "software", 14],
  ["a4", "Google", "Software Engineering Intern", "Zürich", "saved", "software", 3],
  ["a5", "Schweizerische Post", "Mediamatikerin", "Bern", "rejected", "other", 40],
  ["a6", "Zürcher Kantonalbank", "Kaufmann/-frau EFZ Banken", "Zürich", "final_interview", "banking", 9],
  ["a7", "Donaudampfschifffahrtsgesellschaftskapitän AG", "Betriebsunterhaltsmitarbeiter", "Winterthur", "offer", "business", 20],
  ["a8", "Roche", "Laborantin EFZ Biologie", "Basel", "withdrawn", "other", 30],
  ["a9", "Accenture", "Consulting Analyst", "Zürich", "applied", "consulting", 6],
  ["a10", "Sunrise", "Sales Representative", "Opfikon", "applied", "sales", 8],
  ["a11", "Helvetia Versicherungen", "Junior Underwriter", "St. Gallen", "saved", "finance", 12],
  ["a12", "SBB", "ICT-Fachmann/-frau EFZ", "Bern", "preparing", "software", 2],
].map(([id, company, position, location, status, category, dl], i) => ({
  id, user_id: "u1", company, position, location, status, category, currency: "CHF", deadline: iso(dl || 1), created_at: iso(-60 + i), updated_at: iso(-i * 2), applied_at: ["applied", "interview", "final_interview", "offer", "rejected"].includes(status) ? iso(-20 + i) : null,
  job_url: "https://example.com/stelle", match_score: 40 + ((i * 17) % 60), cv_type: ["developer", "finance", "sales", "other"][i % 4], salary_min: 70000, salary_max: 95000, source: "jobs.ch",
  job_description: "Wir suchen eine motivierte Persönlichkeit für eine abwechslungsreiche Tätigkeit. ".repeat(6), notes: "Bewerbungsunterlagen vollständig einreichen. Donnerstag Rückruf Personalabteilung. " .repeat(3),
}));
const CVS = [
  ["cv1", "Lebenslauf Informatik Applikationsentwicklung Schwerpunkt Webentwicklung 2026", "developer", "Ready", "Lebenslauf_Lena_Mueller-Hohenegger-Wartenfels_Informatik_2026_final_v3.pdf"],
  ["cv2", "Lebenslauf Finanz", "finance", "Draft", null], ["cv3", "Allgemein", "other", "Ready", "cv.pdf"],
].map(([id, name, type, status, file]) => ({ id, user_id: "u1", name, type, status, description: "Aktueller Lebenslauf mit Zeugnissen und Referenzen für die Bewerbung. ".repeat(2), updated_at: iso(-3), file_name: file, storage_path: file ? `u1/${id}/${file}` : null, file_type: file ? "application/pdf" : null, file_size: file ? 183204 : null }));
const PROFILE_ROW = { id: "profile-u1", user_id: "u1", first_name: "Lena", last_name: "Müller-Hohenegger-Wartenfels", email: "lena.mueller-hohenegger@beispiel-hochschule.example.ch", phone: "+41 79 123 45 67", location: "Zürich-Oerlikon", website: "https://www.lena-mueller-hohenegger-portfolio.example.ch", linkedin: "https://www.linkedin.com/in/lena-mueller-hohenegger-wartenfels" };
const STUDENTS = [
  ["s1", "Anna-Katharina Meier-Schönenberger", 12, { applied: 5, interview: 3, offer: 1, rejected: 3 }, "Swisscom (Schweiz) AG", "interview"],
  ["s2", "Ben Huber", 4, { saved: 2, applied: 2 }, "UBS", "applied"], ["s3", "Chiara Rossi", 0, {}, null, null],
  ["s4", "David Frei", 8, { applied: 3, rejected: 4, offer: 1 }, "Post", "offer"], ["s5", "Eva Graf", 0, {}, null, null],
  ["s6", "Maximilian Alexander von Hohenzollern-Sigmaringen", 2, { saved: 2 }, "Donaudampfschifffahrtsgesellschaft", "saved"],
];
const OVERVIEW = STUDENTS.map(([id, n, total, sc, co, st], i) => ({ student_id: id, display_name: n, avatar_seed: id, hidden: i === 4, total: i === 4 ? 0 : total, status_counts: i === 4 ? {} : sc, last_7_days: i === 0 ? 3 : 0, last_30_days: i === 4 ? 0 : total, latest_company: i === 4 ? null : co, latest_position: co ? "Applikationsentwickler:in EFZ" : null, latest_status: i === 4 ? null : st, latest_date: co && i !== 4 ? iso(-2) : null, upcoming_deadlines: i === 0 ? [{ application_id: "a1", company: "Swisscom (Schweiz) AG", deadline: iso(8) }, { application_id: "a2", company: "UBS", deadline: iso(12) }] : [] }));
const rpcData = (name, role) => {
  switch (name) {
    case "social_my_profile": return [{ user_id: WHO[role].user.id, role, display_name: WHO[role].name, avatar_seed: "x", invite_code: "LENA-4821", share_with_friends: true, email: `${role}@beispiel.ch` }];
    case "social_list": return [
      { id: "f1", other_user_id: "u2", display_name: "Marco Bianchi-Fuchsenbergerstein", avatar_seed: "m", role: "student", state: "friend", created_at: iso(-30) },
      { id: "f1b", other_user_id: "u5", display_name: "Nora Keller", avatar_seed: "n", role: "student", state: "friend", created_at: iso(-20) },
      { id: "f2", other_user_id: "u3", display_name: "Sara Weber", avatar_seed: "s", role: "student", state: "incoming", created_at: iso(-2) },
      { id: "f3", other_user_id: "u4", display_name: "Tim Egger", avatar_seed: "t", role: "student", state: "outgoing", created_at: iso(-1) }];
    case "social_friends_overview": return [
      { user_id: "u2", display_name: "Marco Bianchi-Fuchsenbergerstein", avatar_seed: "m", shared: true, total: 6, status_counts: { applied: 4, interview: 2 }, map_points_earned: 1200, map_items: 7 },
      { user_id: "u5", display_name: "Nora Keller", avatar_seed: "n", shared: false }];
    case "social_find_by_code": return [{ display_name: "Lena Müller-Hohenegger-Wartenfels", avatar_seed: "x", role: "student", invite_code: "LENA-4821", relation: "none" }];
    case "class_list_mine": return [{ id: "c1", name: "Informatik 4a Applikationsentwicklung Berufsfachschule", school_year: "2026/27", join_code: "KLAS-7Q2", created_at: iso(-60), member_count: 6 }, { id: "c2", name: "Mediamatik 3b", school_year: "2026/27", join_code: "KLAS-9ZZ", created_at: iso(-50), member_count: 0 }];
    case "class_overview": return OVERVIEW;
    case "class_members": return STUDENTS.map(([id, n], i) => ({ student_id: id, display_name: n, avatar_seed: id, joined_at: iso(-50), hidden: i === 4 }));
    case "class_student_applications": return APPS.map((a) => ({ hidden: false, id: a.id, company: a.company, position: a.position, status: a.status, category: a.category, location: a.location, deadline: a.deadline, applied_at: a.applied_at, created_at: a.created_at, updated_at: a.updated_at }));
    case "class_my_classes": return [{ class_id: "c1", name: "Informatik 4a Applikationsentwicklung Berufsfachschule", school_year: "2026/27", teacher_name: WHO.teacher.name, share_applications: true, joined_at: iso(-50) }];
    case "class_preview": return [{ class_id: "c1", name: "Informatik 4a Applikationsentwicklung Berufsfachschule", school_year: "2026/27", teacher_name: WHO.teacher.name, member_count: 6, already_member: false }];
    case "class_join": return [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: WHO.teacher.name, share_applications: false, joined_at: iso(0) }];
    case "map_shop_state": return { balance: 340, earned: 1200, rewardCount: 12, items: [{ id: "i1", itemType: "tree", x: null, z: null, rotation: 0, createdAt: iso(-5) }, { id: "i2", itemType: "bench", x: 3, z: 3, rotation: 0, createdAt: iso(-4) }], layouts: [] };
    default: return [];
  }
};
const JOBS = Array.from({ length: 8 }, (_, i) => ({ title: ["Informatiker/in EFZ Applikationsentwicklung Lehrstelle 2027", "Kaufmann/-frau EFZ", "Mediamatiker/in EFZ"][i % 3] + (i === 0 ? " mit sehr langem Zusatztitel für den Überlauf-Test" : ""), company: ["Swisscom (Schweiz) AG", "UBS", "Donaudampfschifffahrtsgesellschaft AG"][i % 3], location: "8050 Zürich ZH", url: `https://www.jobs.ch/de/stellenangebote/detail/stelle-${i}/`, source: "jobs.ch", sources: [{ name: "jobs.ch", url: `https://www.jobs.ch/de/stellenangebote/detail/stelle-${i}/` }], years: ["2027"] }));

async function installMocks(ctx, role, authed) {
  const w = WHO[role];
  if (authed) await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), w.session);
  await ctx.route("**/api/job-search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: JOBS, nextCursor: null, updates: [], complete: true }) }));
  await ctx.route(`${SUPABASE_URL}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method(); const p = url.pathname;
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { ...cors, "content-range": "0-0/*" }, body: JSON.stringify(b) });
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (p.startsWith("/auth/v1/user")) return authed ? json(w.user) : json({ msg: "no" }, 401);
    if (p.startsWith("/auth/v1/token")) return json(w.session);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: cors });
    if (p.startsWith("/storage/v1/object/sign")) return json({ signedURL: "/storage/v1/object/sign/cvs/x?token=t" });
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const pick = (rows) => (single ? (rows[0] ?? null) : rows);
    if (p.startsWith("/rest/v1/rpc/")) return json(rpcData(p.split("/").pop(), role));
    if (m !== "GET") return json([], 201);
    if (p === "/rest/v1/applications") { const id = url.searchParams.get("id"); return json(pick(role === "teacher" ? [] : id ? APPS.filter((a) => `eq.${a.id}` === id) : APPS)); }
    if (p === "/rest/v1/cvs") return json(pick(role === "teacher" ? [] : CVS));
    if (p === "/rest/v1/profiles") return json(pick([PROFILE_ROW]));
    return json([]);
  });
}

// ---------------------------------------------------------------------------------------------- in-page checks
/* Runs inside the browser. Returns raw findings; selectors are tag/class paths without positional indexes. */
function pageChecks({ phone, isMap }) {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const out = { overflow: [], wide: [], clipped: [], tap: [], font: [], bars: [], modals: [], map: [], docOverflow: 0 };
  const skip = (el) => el.closest("nextjs-portal, script, style, noscript, .sr-only, [aria-hidden='true'] svg");
  const visible = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const sel = (el) => {
    const parts = []; let cur = el;
    for (let i = 0; i < 3 && cur && cur !== document.body && cur.nodeType === 1; i++) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) s += "#" + cur.id;
      const cls = [...cur.classList].filter((c) => !/^(hover|focus|active|group|peer|data|aria|dark|motion)/.test(c)).slice(0, 3);
      if (cls.length) s += "." + cls.map((c) => c.slice(0, 30)).join(".");
      if (cur.getAttribute("role")) s += `[role=${cur.getAttribute("role")}]`;
      parts.unshift(s); cur = cur.parentElement;
    }
    return parts.join(" > ");
  };
  const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.innerText || el.textContent || el.getAttribute("name") || el.getAttribute("href") || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const clippedByAncestor = (el) => { // inside a scroll/clip container that itself fits the viewport
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a); const ox = cs.overflowX;
      if (ox !== "visible") { const r = a.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; }
    }
    return false;
  };
  out.docOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - vw;
  const all = [...document.body.querySelectorAll("*")].filter((el) => !skip(el) && visible(el));
  // 1) elements extending beyond the viewport horizontally (deepest only)
  const off = all.filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (cs.position === "fixed" && (r.left >= vw || r.right <= 0)) return false; return (r.right > vw + 1 || r.left < -1) && !clippedByAncestor(el); });
  const offSet = new Set(off);
  for (const el of off) {
    if ([...el.children].some((c) => offSet.has(c))) continue; // report the deepest offender only
    const r = el.getBoundingClientRect();
    (r.width > vw + 1 ? out.wide : out.overflow).push({ selector: sel(el), text: label(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }
  // 2) clipped text/content: overflow hidden/clip with content larger than box, no ellipsis
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!["hidden", "clip"].includes(cs.overflowX)) continue;
    if (cs.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.children.length + el.childNodes.length > 0) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || el.children.length;
      if (hasText && !el.matches("canvas,svg,img,video") && !/^(html|body)$/i.test(el.tagName) && el.getBoundingClientRect().width < vw)
        out.clipped.push({ selector: sel(el), text: label(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
    if (el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0 && ["hidden", "clip"].includes(cs.overflowY) && cs.display !== "inline" && !el.matches("canvas,svg,img") && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && (!cs.webkitLineClamp || cs.webkitLineClamp === "none")) {
      out.clipped.push({ selector: sel(el), text: label(el), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, axis: "y" });
    }
  }
  // 3) tap targets + 4) input font size (phones only)
  if (phone) {
    const inlineLink = (el) => el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p,li,span,label,td,dd");
    for (const el of all.filter((e) => e.matches("a[href],button,summary,[role=button],[role=tab],[role=link],[role=menuitem],input:not([type=hidden]),select,textarea,label[for]"))) {
      if (el.disabled && !el.matches("input,select,textarea")) { /* disabled still reported when small */ }
      if (el.matches("input[type=checkbox],input[type=radio],input[type=file]") && el.closest("label")) continue; // the wrapping label is the target
      if (el.matches("label[for]") && !el.querySelector("input") && !/(^|\s)(rounded|border|cursor-pointer)/.test(el.className)) continue;
      if (inlineLink(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.tap.push({ selector: sel(el), text: label(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
    for (const el of all.filter((e) => e.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=submit]):not([type=button]),select,textarea"))) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.font.push({ selector: sel(el), text: label(el), fontSize: fs });
    }
  }
  // 5) fixed/sticky bars (wide ones) covering content when scrolled to the end / start
  const bars = all.filter((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return (cs.position === "fixed" || cs.position === "sticky") && r.width >= vw * 0.5 && r.height >= 24 && r.height < vh * 0.6 && !el.closest("[role=dialog],[aria-modal=true],dialog"); });
  const probe = (atBottom) => {
    window.scrollTo(0, atBottom ? document.documentElement.scrollHeight : 0);
    for (const bar of bars) {
      const br = bar.getBoundingClientRect(); const bcs = getComputedStyle(bar);
      if (!(br.bottom > 0 && br.top < vh)) continue;
      const isBottom = br.top > vh / 2; if (isBottom !== atBottom) continue;
      const hits = [];
      for (const el of document.body.querySelectorAll("a,button,input,select,textarea,p,h1,h2,h3,li,label,td,th,span,img")) {
        if (bar.contains(el) || el.contains(bar) || skip(el) || !visible(el) || el.closest('details:not([open])')) continue;
        if (el.closest("[role=dialog],[aria-modal=true],dialog")) continue;
        if (["fixed", "sticky"].includes(getComputedStyle(el).position)) continue;
        if (el.tagName === "SPAN" && !el.childNodes.length) continue;
        if ([...el.children].some((c) => /^(A|BUTTON|P|H1|H2|H3|LI)$/.test(c.tagName))) continue;
        const r = el.getBoundingClientRect();
        const ox = Math.min(r.right, br.right) - Math.max(r.left, br.left), oy = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
        if (ox > 4 && oy > 4 && r.top < vh && r.bottom > 0) { const top = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), Math.min(Math.max(Math.max(r.top, br.top) + oy / 2, 0), vh - 1)); if (top && (bar.contains(top))) hits.push(`${el.tagName.toLowerCase()} "${label(el).slice(0, 24)}" ${Math.round(oy)}px`); }
      }
      if (hits.length) out.bars.push({ selector: sel(bar) + (window.__dbg ? ` @sy=${Math.round(scrollY)} sh=${document.documentElement.scrollHeight} vh=${vh} bar=${Math.round(br.top)}-${Math.round(br.bottom)}` : ''), at: atBottom ? "end of page" : "top of page", height: Math.round(br.height), covers: hits.slice(0, 4) });
    }
  };
  if (bars.length) { probe(true); probe(false); window.scrollTo(0, 0); }
  // 6) dialogs taller/wider than the viewport
  for (const d of document.querySelectorAll("[role=dialog],[aria-modal=true],dialog[open]")) {
    if (!visible(d)) continue;
    const r = d.getBoundingClientRect();
    if (r.height > vh + 1 || r.width > vw + 1 || r.top < -1 || r.bottom > vh + 1) {
      const scrollable = [d, ...d.querySelectorAll("*")].some((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight; });
      out.modals.push({ selector: sel(d), height: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), viewportH: vh, width: Math.round(r.width), internalScroll: scrollable });
    }
  }
  // 7) map touch behaviour
  if (isMap) {
    const hosts = [...document.querySelectorAll("canvas, svg[data-map-renderer]")].filter(visible);
    if (!hosts.length) out.map.push({ issue: "no-canvas", detail: "no <canvas>/<svg data-map-renderer> rendered (WebGL unavailable or map failed)" });
    for (const c of hosts) {
      const ta = getComputedStyle(c).touchAction;
      if (!/none|pinch-zoom|manipulation/.test(ta) || ta.includes("pan-y")) out.map.push({ issue: "touch-action", detail: `${c.tagName.toLowerCase()} touch-action is "${ta}" (expected none so one-finger pan/pinch does not scroll the page)`, selector: sel(c) });
      const host = c.parentElement; const hcs = getComputedStyle(host);
      if (!/contain|none/.test(hcs.overscrollBehaviorY)) out.map.push({ issue: "overscroll", detail: `canvas host overscroll-behavior-y is "${hcs.overscrollBehaviorY}" (expected contain: pull-to-refresh/scroll chaining)`, selector: sel(host) });
      const r = host.getBoundingClientRect();
      if (r.height > vh * 0.95) out.map.push({ issue: "canvas-height", detail: `map canvas host is ${Math.round(r.height)}px tall in a ${vh}px viewport (map fills the whole screen, page cannot be scrolled past it by touch)`, selector: sel(host) });
      if (r.width > vw + 1) out.map.push({ issue: "canvas-width", detail: `map host ${Math.round(r.width)}px wider than viewport ${vw}px`, selector: sel(host) });
    }
    const htmlOb = getComputedStyle(document.documentElement).overscrollBehaviorY, bodyOb = getComputedStyle(document.body).overscrollBehaviorY;
    out.map.push({ issue: "info", detail: `html overscroll-behavior-y=${htmlOb}, body=${bodyOb}` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- source mapping
const SRC_FILES = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".next", "scripts", "docs"].includes(f.name) || f.name.startsWith(".")) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(tsx|css)$/.test(f.name)) SRC_FILES.push({ file: path.relative(ROOT, p), text: fs.readFileSync(p, "utf8") }); } })(ROOT);
const SHARED_RX = /^(components\/ui\/|components\/layout\/|app\/layout|app\/globals|app\/error|app\/loading|app\/not-found)/;
function sourceFor(item, routeFile) {
  const tokens = [];
  if (item.text && item.text.length >= 3) tokens.push(item.text.replace(/…$/, "").slice(0, 28));
  const clsTokens = (item.selector || "").split(" > ").pop().split(".").slice(1).filter((c) => c.length > 5);
  const sourceMatches = (needle) => SRC_FILES.filter((f) => f.text.includes(needle));
  const rank = (arr) => arr.sort((a, b) => (b.file === routeFile) - (a.file === routeFile) || (SHARED_RX.test(b.file) - SHARED_RX.test(a.file)));
  for (const t of tokens) { const m = rank(sourceMatches(t)); if (m.length && m.length <= 4) return m[0].file; }
  const own = (item.selector || "").split(" > ").map((s) => s.split(".").slice(1)).flat();
  for (const t of [...clsTokens.reverse(), ...own.filter((c) => c.length > 8)]) { const m = rank(sourceMatches(t)); if (m.length && m.length <= 4) return m[0].file; }
  if (/\bnav\b|tab bar|tabbar/i.test(item.selector || "")) return "components/layout/workspace-shell.tsx";
  return routeFile;
}

// ---------------------------------------------------------------------------------------------- defect model
const FIXES = {
  "overflow-x": (d) => "Add `min-w-0` to the flex/grid child, `break-words`/`[overflow-wrap:anywhere]` for long German words, `flex-wrap`, or wrap wide content in `overflow-x-auto`; ensure widths use `max-w-full`.",
  "element-wider-than-viewport": () => "Constrain with `max-w-full`/`w-full min-w-0`; use `overflow-x-auto` on tables or switch to a stacked card layout below `sm`.",
  "clipped-content": () => "Content is cut off by `overflow:hidden` without ellipsis: allow wrapping (`whitespace-normal break-words`), add `truncate` + title, or remove the fixed width/height.",
  "tap-target": (d) => `Increase hit area to >= 44x44px on touch (e.g. \`min-h-11 min-w-11\`, padding, or an invisible ::after with inset -8px). Measured ${d.w}x${d.h}.`,
  "input-font-size": (d) => `Use \`text-base\` (16px) on inputs at mobile widths (e.g. \`text-base sm:text-sm\`) to prevent iOS zoom-on-focus. Measured ${d.fontSize}px.`,
  "bar-covers-content": () => "Add bottom/top padding to the scroll container equal to the bar height + `env(safe-area-inset-*)`, or make the bar non-sticky; verify with keyboard open (use `dvh`).",
  "modal-too-tall": (d) => `Give the dialog \`max-h-[calc(100dvh-2rem)]\` with \`overflow-y-auto\` on the body (header/footer pinned); on phones use a bottom sheet. ${d.internalScroll ? "(has internal scroll but panel itself exceeds viewport)" : "(no internal scroll)"}`,
  "map-touch": (d) => d.fix || "Set `touch-action: none` on the canvas, `overscroll-behavior: contain` on its host, and keep the canvas height <= ~70dvh so the page stays scrollable.",
  "no-render": () => "Page did not render expected content (error boundary, blank, or redirect). Investigate.",
  "console-error": () => "Fix runtime error.",
};
const TYPE_LABEL = { "overflow-x": "Horizontal overflow", "element-wider-than-viewport": "Element wider than viewport", "clipped-content": "Clipped content", "tap-target": "Touch target < 44px", "input-font-size": "Input font-size < 16px", "bar-covers-content": "Fixed/sticky bar covers content", "modal-too-tall": "Modal taller than viewport", "map-touch": "Map touch behaviour", "no-render": "Page did not render" };
const SEVERITY = { "overflow-x": 1, "element-wider-than-viewport": 1, "bar-covers-content": 1, "modal-too-tall": 1, "clipped-content": 2, "map-touch": 2, "input-font-size": 3, "tap-target": 3, "no-render": 0 };

// ---------------------------------------------------------------------------------------------- run
function loadChromium() {
  const candidates = [path.join(ROOT, "node_modules/playwright-core"), path.join(ROOT, "../audit-tools/node_modules/playwright-core")];
  for (const c of candidates) { try { return createRequire(import.meta.url)(c).chromium; } catch { /* next */ } }
  try { return createRequire(import.meta.url)("playwright-core").chromium; } catch { throw new Error("playwright-core not found: run `npm i --no-save playwright-core` (or keep ../audit-tools/node_modules)"); }
}
function chromePath() {
  const home = os.homedir();
  const globs = [`${home}/Library/Caches/ms-playwright`];
  for (const g of globs) if (fs.existsSync(g)) for (const d of fs.readdirSync(g).filter((x) => x.startsWith("chromium-"))) { const p = path.join(g, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"); if (fs.existsSync(p)) return p; }
  const sys = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; return fs.existsSync(sys) ? sys : undefined;
}
async function waitFor(url, ms = 120000) { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.status < 500 || r.status === 500) return; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 800)); } throw new Error("server did not start: " + url); }

async function startServer() {
  const given = arg("base", null); if (given && given !== true) return { base: given, stop: () => {} };
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy", NEXT_TELEMETRY_DISABLED: "1" };
  const dev = argv.includes("--dev");
  if (!dev) { console.error("[audit] next build …"); execSync("npx next build", { cwd: ROOT, env, stdio: ["ignore", "ignore", "inherit"] }); }
  const child = spawn("npx", ["next", dev ? "dev" : "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: "ignore", detached: true });
  const base = `http://localhost:${PORT}`; await waitFor(base + "/login");
  return { base, stop: () => { try { process.kill(-child.pid); } catch { /* gone */ } } };
}

async function main() {
  const chromium = loadChromium();
  const wantRoutes = arg("routes", null) && arg("routes").split(",");
  const wantWidths = arg("widths", null) && arg("widths").split(",");
  const wantThemes = (arg("themes", "light,dark")).split(",");
  const routes = ROUTES.filter((r) => !wantRoutes || wantRoutes.includes(r[1]) || wantRoutes.includes(r[0]));
  const vps = VIEWPORTS.filter((v) => !wantWidths || wantWidths.includes(v.name) || wantWidths.includes(String(v.w)));
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const raw = []; // {route, path, width, theme, type, item}
  const pageMeta = [];
  let n = 0; const total = routes.length * vps.length * wantThemes.length;
  try {
    for (const vp of vps) for (const theme of wantThemes) {
      for (const [name, rpath, role, authed, group, routeFile] of routes) {
        n++;
        const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, hasTouch: vp.w < 1000, isMobile: vp.w < 1000, colorScheme: theme });
        await ctx.addInitScript((t) => { try { localStorage.setItem("wendapply-theme", t); } catch { /* ignore */ } }, theme);
        await installMocks(ctx, role, authed);
        const page = await ctx.newPage(); const logs = [];
        page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 160)));
        const add = (type, item, extra = {}) => raw.push({ route: name, path: rpath, group, routeFile, width: vp.name, theme, type, item, ...extra });
        try {
          await page.goto(server.base + rpath, { waitUntil: "load", timeout: 45000 });
          await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(name === "map" ? 2500 : 700);
          const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
          if (bodyLen < 15) add("no-render", { selector: "body", text: "empty page" });
          const res = await page.evaluate(pageChecks, { phone: !!vp.phone, isMap: name === "map" });
          for (const i of res.overflow) add("overflow-x", i);
          if (res.docOverflow > 1 && !res.overflow.length && !res.wide.length) add("overflow-x", { selector: "html", text: `document scrollWidth exceeds viewport by ${res.docOverflow}px (offender not isolated)`, width: res.docOverflow });
          for (const i of res.wide) add("element-wider-than-viewport", i);
          for (const i of res.clipped) add("clipped-content", i);
          for (const i of res.tap) add("tap-target", i);
          for (const i of res.font) add("input-font-size", i);
          for (const i of res.bars) add("bar-covers-content", { selector: i.selector, text: `${i.at}: ${i.covers.join("; ")}`, ...i });
          for (const i of res.modals) add("modal-too-tall", i);
          for (const i of res.map.filter((m) => m.issue !== "info")) add("map-touch", { selector: i.selector || "canvas", text: i.issue, ...i });
          if (name === "map") pageMeta.push({ route: name, width: vp.name, theme, info: res.map.filter((m) => m.issue === "info").map((m) => m.detail).join("") });
          if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${name}-${vp.name}${theme === "dark" ? "-dark" : ""}.png`), fullPage: name !== "map" }).catch(() => {});
          // opened dialogs / sheets: try opener buttons, measure, screenshot, close
          if (MODALS && authed && theme === "light") await probeModals(page, name, vp, add);
        } catch (e) { add("no-render", { selector: "page", text: "navigation failed: " + String(e.message).slice(0, 120) }); }
        for (const l of logs) add("console-error", { selector: "window", text: l });
        await ctx.close();
        if (n % 20 === 0) console.error(`[audit] ${n}/${total}`);
      }
    }
  } finally { await browser.close(); server.stop(); }
  writeReport(raw, pageMeta, { routes, vps, themes: wantThemes });
}

const OPENERS = /(mehr|neu|hinzufügen|erstellen|bearbeiten|löschen|entfernen|filter|beitreten|kaufen|shop|platzieren|abmelden|einstellungen|hochladen|teilen|umbenennen|code|einladen|freund)/i;
async function probeModals(page, name, vp, add) {
  const cands = await page.$$("button:visible, [role=button]:visible");
  let tried = 0;
  for (const c of cands) {
    if (tried >= 6) break;
    const txt = ((await c.getAttribute("aria-label")) || (await c.innerText().catch(() => "")) || "").trim();
    if (!OPENERS.test(txt)) continue;
    if (/abmelden/i.test(txt)) continue; // never actually log out
    tried++;
    try {
      await c.click({ timeout: 1500, trial: false });
      await page.waitForTimeout(700);
      const found = await page.evaluate(() => { const d = document.querySelector("[role=dialog],[aria-modal=true],dialog[open]"); return !!d && d.getBoundingClientRect().height > 0; });
      if (found) {
        const res = await page.evaluate(pageChecks, { phone: !!vp.phone, isMap: false });
                for (const i of res.modals) add("modal-too-tall", { ...i, text: `dialog opened via "${txt.slice(0, 24)}"` });
        for (const i of res.font) add("input-font-size", { ...i, text: i.text + ` (dialog "${txt.slice(0, 20)}")` });
        if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${name}-${vp.name}-modal${tried}.png`) }).catch(() => {});
        await page.keyboard.press("Escape"); await page.waitForTimeout(250);
        const still = await page.evaluate(() => !!document.querySelector("[role=dialog],[aria-modal=true],dialog[open]"));
        if (still) { await page.reload({ waitUntil: "load" }).catch(() => {}); await page.waitForTimeout(500); break; }
      }
    } catch { /* not clickable */ }
  }
}

// ---------------------------------------------------------------------------------------------- report
function writeReport(raw, pageMeta, cfg) {
  const defects = new Map();
  for (const r of raw) {
    if (r.type === "console-error") continue;
    const file = sourceFor(r.item, r.routeFile);
    const shared = SHARED_RX.test(file);
    const group = shared ? 1 : r.group;
    const stableSel = r.item.selector;
    const key = [shared ? "shared" : r.route, r.type, stableSel, r.type === "map-touch" ? r.item.issue : ""].join("|");
    let d = defects.get(key);
    if (!d) { d = { route: shared ? "(shared)" : r.route, routes: new Set(), path: r.path, type: r.type, selector: stableSel, group, file, widths: new Set(), themes: new Set(), examples: new Set(), detail: r.item, fix: "" }; defects.set(key, d); }
    d.routes.add(r.route); d.widths.add(r.width); d.themes.add(r.theme);
    if (d.examples.size < 3 && r.item.text) d.examples.add(String(r.item.text).slice(0, 90));
    if (r.type === "tap-target" || r.type === "input-font-size") { d.detail = d.detail.w && r.item.w && r.item.w * r.item.h > d.detail.w * d.detail.h ? d.detail : r.item; }
  }
  const sortW = (ws) => [...ws].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
  const list = [...defects.values()].map((d) => ({ ...d, fix: FIXES[d.type](d.detail), widths: sortW(d.widths), themes: [...d.themes], routes: [...d.routes], examples: [...d.examples] }));
  const routeOrder = ROUTES.map((r) => r[0]);
  list.sort((a, b) => a.group - b.group || (a.route === "(shared)" ? -1 : b.route === "(shared)" ? 1 : routeOrder.indexOf(a.route) - routeOrder.indexOf(b.route)) || SEVERITY[a.type] - SEVERITY[b.type] || a.selector.localeCompare(b.selector));
  list.forEach((d, i) => { d.id = i + 1; });
  const groupName = { 1: "GROUP1 core (layout, nav/tab bar, login, dashboard, applications*, map, profile, shared components)", 2: "GROUP2 social (classes*, teacher overview, friends, invite)", 3: "GROUP3 (settings, cvs, search, analytics)" };
  const counts = { 1: 0, 2: 0, 3: 0 }; list.forEach((d) => counts[d.group]++);
  const byTypeAll = {}; list.forEach((d) => { byTypeAll[d.type] = (byTypeAll[d.type] || 0) + 1; });
  const consoleErrors = raw.filter((r) => r.type === "console-error").reduce((m, r) => { const k = `${r.route}: ${r.item.text}`; m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const noRender = raw.filter((r) => r.type === "no-render");

  const L = [];
  L.push("# Responsive audit", "", `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} by \`scripts/responsive-audit.mjs\` (phase \`${PHASE}\`).`, "");
  L.push(`Matrix: ${cfg.routes.length} routes × ${cfg.vps.length} viewports (${cfg.vps.map((v) => v.name).join(", ")}) × themes (${cfg.themes.join(", ")}). Supabase fully mocked (German fixtures with very long names). Screenshots: \`${SHOT_DIR}\`. Machine-readable: \`docs/responsive-audit.json\`.`, "");
  L.push("Re-run: `node scripts/responsive-audit.mjs --phase after` (builds + starts the app on :3150; add `--dev` for dev server, `--routes /map,/friends`, `--widths 320,375`, `--themes light`, `--base http://localhost:3000` to reuse a running server).", "");
  L.push("## Summary", "", "| Group | Defects |", "|---|---|", ...[1, 2, 3].map((g) => `| ${groupName[g]} | **${counts[g]}** |`), `| **Total** | **${list.length}** |`, "");
  L.push("By type: " + Object.entries(byTypeAll).map(([k, v]) => `${TYPE_LABEL[k]} ${v}`).join(" · "), "");
  L.push("Method notes: a defect is one (route, check, selector) aggregated over all widths/themes where it occurs; defects whose source file is a shared component/layout are listed once under GROUP1 `(shared)` with the routes they appear on. Selectors are tag/class paths (no positional index). Source file = best-effort text/class match in the codebase. Tap-target and font-size checks run on phone viewports (≤430 wide portrait and 667×375 / 844×390 landscape) only. Dialog checks open up to 6 opener buttons per page (light theme) and measure the resulting dialog. Dark mode is covered by screenshots and all DOM checks; colour contrast is not computed (review screenshots).", "");
  if (noRender.length) { L.push("### Pages that did not render", ""); for (const [k, v] of Object.entries(noRender.reduce((m, r) => { const k = `${r.route} @${r.width} ${r.theme}: ${r.item.text}`; m[k] = 1; return m; }, {}))) L.push(`- ${k}`); L.push(""); }
  if (consoleErrors.size) { L.push("### Console / page errors (informational)", ""); for (const [k, v] of [...consoleErrors].slice(0, 15)) L.push(`- ${k} (×${v})`); L.push(""); }
  if (pageMeta.length) L.push("### Map page info", "", ...[...new Set(pageMeta.map((m) => m.info))].map((i) => `- ${i}`), "");

  for (const g of [1, 2, 3]) {
    L.push(`## ${groupName[g]}`, "", `${counts[g]} defects.`, "");
    const inGroup = list.filter((d) => d.group === g);
    const routeKeys = [...new Set(inGroup.map((d) => d.route))];
    for (const rk of routeKeys) {
      const ds = inGroup.filter((d) => d.route === rk);
      const meta = ROUTES.find((r) => r[0] === rk);
      L.push(`### ${rk === "(shared)" ? "Shared components / layout / navigation" : `${meta[1]} (${rk})`}`, "");
      for (const d of ds) {
        L.push(`**#${d.id}** — ${TYPE_LABEL[d.type]}${d.type === "map-touch" ? ` (${d.detail.issue})` : ""}`);
        L.push(`- Route: ${d.route === "(shared)" ? "shared — " + d.routes.join(", ") : d.path}`);
        L.push(`- Width(s): ${d.widths.join(", ")} · theme: ${d.themes.join("/")}`);
        L.push(`- Element: \`${d.selector}\`${d.examples.length ? ` — e.g. ${d.examples.map((e) => `“${e.replace(/`/g, "'")}”`).join(", ")}` : ""}`);
        L.push(`- Problem: ${problemText(d)}`);
        L.push(`- Suggested fix: ${d.fix}`);
        L.push(`- File: \`${d.file}\``, "");
      }
    }
  }
  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "docs/responsive-audit.md"), L.join("\n"));
  fs.writeFileSync(path.join(ROOT, "docs/responsive-audit.json"), JSON.stringify({ generated: new Date().toISOString(), phase: PHASE, counts, total: list.length, defects: list.map(({ detail, ...d }) => ({ ...d, problem: problemText({ ...d, detail }), detail })) }, null, 1));
  console.log(`\nAudit done: GROUP1=${counts[1]} GROUP2=${counts[2]} GROUP3=${counts[3]} total=${list.length}\nReport: ${path.join(ROOT, "docs/responsive-audit.md")}`);
}
function problemText(d) {
  const x = d.detail;
  switch (d.type) {
    case "overflow-x": return x.right !== undefined ? `element spans x=${x.left}…${x.right}px (width ${x.width}px) beyond the viewport → horizontal scroll` : x.text;
    case "element-wider-than-viewport": return `element is ${x.width}px wide, wider than the viewport (x=${x.left}…${x.right})`;
    case "clipped-content": return x.axis === "y" ? `content height ${x.scrollHeight}px is cut off in a ${x.clientHeight}px box (overflow hidden)` : `content ${x.scrollWidth}px wide is cut off in a ${x.clientWidth}px box (overflow hidden, no ellipsis)`;
    case "tap-target": return `interactive element is ${x.w}×${x.h}px (< 44×44)`;
    case "input-font-size": return `computed font-size ${x.fontSize}px (< 16px → iOS Safari zooms the page on focus)`;
    case "bar-covers-content": return `${x.at}: bar (${x.height}px high) covers ${x.covers.join("; ")}`;
    case "modal-too-tall": return `dialog is ${x.height}px tall (top ${x.top}, bottom ${x.bottom}) in a ${x.viewportH}px viewport${x.width ? `, ${x.width}px wide` : ""}`;
    case "map-touch": return x.detail;
    default: return x.text || "";
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
