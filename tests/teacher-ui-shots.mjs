// Screenshots + interaction checks for the teacher screens against a stubbed Supabase.
// Usage: PLAYWRIGHT=/private/tmp/pw/node_modules/playwright-core/index.mjs CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3210 node tests/teacher-ui-shots.mjs
import { mkdirSync } from "node:fs";
import { installStub } from "../scripts/ux-v2-stub.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3210";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/teacher-ui/`;
mkdirSync(OUT, { recursive: true });
const day = (d) => new Date(Date.now() + d * 864e5).toISOString();
const dateOnly = (d) => day(d).slice(0, 10);

function makeRpc(variant = "full") {
  const st = { invites: [{ id: "i1", token: "tok_abcdefghijklmnopqrstuv1", email: "lea@schule.ch", max_uses: 1, uses: 0, expires_at: day(10), revoked: false, created_at: day(-2) }, { id: "i2", token: "tok_abcdefghijklmnopqrstuv2", email: null, max_uses: null, uses: 4, expires_at: day(-3), revoked: false, created_at: day(-20) }], news: [{ id: "n1", text: "Bitte bis Freitag mindestens 3 Bewerbungen abschicken und den Lebenslauf hochladen.", created_at: day(-1), author_name: "Frau Keller" }], nudged: new Set(), students: null };
  const student = (id, name, o = {}) => ({ student_id: id, display_name: name, avatar_seed: id, joined_at: day(-40), hidden: false, total: 5, status_counts: { applied: 3, interview: 1, rejected: 1 }, interviews: 1, offers: 0, placed: false, last_activity: day(-2), inactive: false, last_nudged_at: null, ...o });
  st.students = variant === "empty" || variant === "nostudents" ? [] : [
    student("s1", "Anna Meier", { total: 8, status_counts: { applied: 4, interview: 2, offer: 1, rejected: 1 }, offers: 1, interviews: 2, placed: true }),
    student("s2", "Ben Huber", { total: 2, status_counts: { applied: 1, saved: 1 }, interviews: 0, last_activity: day(-25), inactive: true }),
    student("s3", "Cleo Brunner", { hidden: true, total: 0, status_counts: {}, interviews: 0, last_activity: null }),
    student("s4", "Dario Frei", { total: 6, status_counts: { applied: 3, interview: 2, preparing: 1 }, interviews: 2, last_activity: day(-1) }),
    student("s5", "Elif Kaya", { total: 0, status_counts: {}, interviews: 0, last_activity: day(-30), inactive: true, last_nudged_at: day(-1) }),
    student("s6", "=Finn Evil", { total: 3, status_counts: { applied: 3 }, interviews: 0, last_activity: day(-5) }),
  ];
  const dash = () => ({
    totals: { students: 6, classes: 2, applications: 24, interviews: 5, offers: 1, placed: 1, inactive: 2, deadlines_7d: 2, hidden_students: 1 },
    classes: [
      { id: "c1", name: "Informatik 4a", school_year: "2026/27", archived: false, is_owner: true, join_code: "KLAS-7Q2", students: 6, applications: 24, interviews: 5, offers: 1, placed: 1, inactive: 2, hidden: 1 },
      { id: "c2", name: "Mediamatik 3b", school_year: "2026/27", archived: false, is_owner: false, join_code: "MEDI-3B9", students: 18, applications: 61, interviews: 12, offers: 4, placed: 3, inactive: 0, hidden: 0 },
      { id: "c0", name: "Informatik 4a (Vorjahr)", school_year: "2025/26", archived: true, is_owner: true, join_code: "OLD-1", students: 21, applications: 99, interviews: 30, offers: 14, placed: 12, inactive: 0, hidden: 0 },
    ],
    deadlines: [{ class_id: "c1", class_name: "Informatik 4a", student_id: "s4", student_name: "Dario Frei", company: "Swisscom", position: "Applikationsentwickler:in EFZ", deadline: dateOnly(2) }, { class_id: "c1", class_name: "Informatik 4a", student_id: "s2", student_name: "Ben Huber", company: "UBS", position: "Informatiker EFZ", deadline: dateOnly(6) }],
  });
  const emptyDash = () => ({ totals: { students: 0, classes: 0, applications: 0, interviews: 0, offers: 0, placed: 0, inactive: 0, deadlines_7d: 0, hidden_students: 0 }, classes: [], deadlines: [] });
  return {
    st,
    rpc: {
      teacher_dashboard: () => (variant === "empty" ? emptyDash() : dash()),
      teacher_class_students: () => st.students,
      class_student_timeline: (b) => b.p_student_id === "s3" ? [{ hidden: true, application_id: null, company: "", position: "", status: "applied", event_date: null, kind: "hidden" }] : [
        { hidden: false, application_id: "a1", company: "Swisscom", position: "Applikationsentwickler:in EFZ", status: "saved", event_date: day(-20), kind: "status" }, { hidden: false, application_id: "a1", company: "Swisscom", position: "Applikationsentwickler:in EFZ", status: "applied", event_date: day(-14), kind: "status" }, { hidden: false, application_id: "a1", company: "Swisscom", position: "Applikationsentwickler:in EFZ", status: "interview", event_date: day(-3), kind: "status" },
        { hidden: false, application_id: "a2", company: "UBS", position: "Informatiker EFZ", status: "applied", event_date: day(-9), kind: "status" }, { hidden: false, application_id: "a2", company: "UBS", position: "Informatiker EFZ", status: "rejected", event_date: day(-2), kind: "status" }],
      class_invite_list: () => st.invites,
      class_invite_create: () => { const r = { id: "i" + (st.invites.length + 1), token: "tok_abcdefghijklmnopqrstuv9", email: null, max_uses: null, uses: 0, expires_at: day(14), revoked: false, created_at: day(0) }; st.invites.unshift(r); return [{ id: r.id, token: r.token, expires_at: r.expires_at }]; },
      class_invite_create_many: (b) => b.p_emails.map((e, i) => { st.invites.unshift({ id: "m" + i, token: `tok_many_${i}_abcdefghijklmnop`, email: e, max_uses: 1, uses: 0, expires_at: day(14), revoked: false, created_at: day(0) }); return { email: e, token: `tok_many_${i}_abcdefghijklmnop` }; }),
      class_invite_revoke: (b) => { const i = st.invites.find((x) => x.id === b.p_invitation_id); if (i) i.revoked = true; return null; },
      class_announcement_list: () => st.news,
      class_announce: (b) => { st.news.unshift({ id: "n" + Date.now(), text: b.p_text, created_at: day(0), author_name: "Frau Keller" }); return "n"; },
      class_nudge: (b) => { if (b.p_student_id === "s5" || st.nudged.has(b.p_student_id)) return { __error: "RATE_LIMITED" }; st.nudged.add(b.p_student_id); return null; },
      class_teachers_list: () => [{ teacher_id: "t1", display_name: "Frau Keller", email: "keller@schule.ch", added_at: day(-60), is_owner: true }, { teacher_id: "t2", display_name: "Herr Bachmann", email: "bachmann@schule.ch", added_at: day(-10), is_owner: false }],
      class_add_coteacher: () => null, class_remove_coteacher: () => null, class_set_archived: () => null, class_rename: () => null, class_delete: () => null, class_regenerate_code: () => "NEU-CODE", class_remove_student: () => null,
      class_create: () => [{ id: "c9", name: "Neu", school_year: "", join_code: "NEU-1", created_at: day(0), member_count: 0 }],
    },
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--enable-features=ShapeDetection,BarcodeDetector"] });
const problems = [];
async function session({ w, h, dark, variant = "full" }, fn) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light", deviceScaleFactor: mobile ? 2 : 1, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript((t) => localStorage.setItem("wendapply-theme", t), dark ? "dark" : "light");
  const m = makeRpc(variant);
  const stub = await installStub(ctx, { role: "teacher", rpc: m.rpc });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (msg) => { if (msg.type() === "error" && !/Failed to load resource|favicon/.test(msg.text())) problems.push(`console ${msg.text().slice(0, 200)}`); });
  try { await fn(page, stub, m); } finally { await ctx.close(); }
}
const shot = (page, name, full = true) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
const go = async (page, path, ready) => { await page.goto(BASE + path, { waitUntil: "domcontentloaded" }); await page.waitForSelector(ready, { timeout: 90000, state: "attached" }); await page.waitForTimeout(400); };
const tabTo = async (page, name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(500); };
const tag = (w, dark) => `${w}-${dark ? "dark" : "light"}`;

for (const dark of [false, true]) for (const w of [375, 768, 1280]) {
  const h = w < 768 ? 812 : w === 768 ? 1024 : 800;
  await session({ w, h, dark }, async (page) => {
    await go(page, "/teacher", "text=Informatik 4a");
    await shot(page, `dashboard-${tag(w, dark)}`);
    await page.getByRole("tab", { name: /Archiv/ }).click(); await page.waitForTimeout(300);
    if (w === 1280) await shot(page, `dashboard-archive-${tag(w, dark)}`);
  });
  await session({ w, h, dark }, async (page) => {
    await go(page, "/teacher/classes/c1", "text=Anna Meier");
    await shot(page, `class-students-${tag(w, dark)}`);
    if (w !== 768) {
      await tabTo(page, /Einladen/); await shot(page, `class-invite-${tag(w, dark)}`);
      await tabTo(page, /Mitteilungen/); await shot(page, `class-news-${tag(w, dark)}`);
      await tabTo(page, /Einstellungen/); await shot(page, `class-settings-${tag(w, dark)}`);
    }
  });
  await session({ w, h, dark }, async (page) => {
    await go(page, "/teacher/classes/c1/students/s1", '[aria-label="Verlauf der Bewerbungen"]');
    await shot(page, `student-${tag(w, dark)}`);
    await go(page, "/teacher/classes/c1/students/s3", "text=teilt keine Bewerbungsdaten");
    await shot(page, `student-hidden-${tag(w, dark)}`);
  });
}

// Empty states, modals and interactions (1280 + 375)
for (const [w, h] of [[1280, 800], [375, 812]]) {
  await session({ w, h, dark: false, variant: "empty" }, async (page) => {
    await go(page, "/teacher", "text=Noch keine Klasse"); await shot(page, `dashboard-empty-${w}`);
    await page.getByRole("button", { name: "Klasse erstellen" }).first().click(); await page.waitForTimeout(400); await shot(page, `dialog-create-class-${w}`, false);
  });
  await session({ w, h, dark: false, variant: "nostudents" }, async (page) => {
    await go(page, "/teacher/classes/c1", "text=Noch keine Schüler"); await shot(page, `class-empty-${w}`);
  });
}
await session({ w: 1280, h: 800, dark: false }, async (page, stub) => {
  await go(page, "/teacher/classes/c1", "text=Anna Meier");
  // filters/search
  await page.getByRole("tab", { name: /^Inaktiv/ }).click(); await page.waitForTimeout(300);
  const inactiveRows = await page.locator("tbody tr").count(); if (inactiveRows !== 2) problems.push(`filter inactive rows=${inactiveRows}`);
  await page.getByRole("tab", { name: /^Alle/ }).click();
  await page.getByLabel("Schüler suchen").fill("zzz"); await page.waitForTimeout(300); await shot(page, "class-no-match-1280");
  await page.getByRole("button", { name: "Zurücksetzen" }).click();
  // CSV download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
  const csv = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  if (!csv.includes("'=Finn Evil") || csv.split("\r\n").length !== 8) problems.push("csv content wrong:\n" + csv.slice(0, 300));
  // nudge single (Ben: ok), then rate limited (Elif button disabled)
  const elif = page.locator("tbody tr", { hasText: "Elif Kaya" }).getByRole("button", { name: /Erinnert/ });
  if (!(await elif.isDisabled())) problems.push("Elif nudge button should be disabled");
  await page.locator("tbody tr", { hasText: "Ben Huber" }).getByRole("button", { name: "Erinnern" }).click(); await page.waitForTimeout(400); await shot(page, "dialog-nudge-1280", false);
  await page.getByRole("button", { name: "Erinnerung senden" }).last().click(); await page.waitForTimeout(600);
  if (!stub.calls.some((c) => c.rpc === "class_nudge" && c.body.p_student_id === "s2")) problems.push("nudge rpc not called");
  await page.locator("tbody tr", { hasText: "Ben Huber" }).getByRole("button", { name: /Erinn/ }).click();
  await page.getByRole("button", { name: "Erinnerung senden" }).last().click(); await page.waitForSelector("text=in den letzten 3 Tagen schon erinnert"); await shot(page, "dialog-nudge-ratelimited-1280", false);
  await page.getByRole("button", { name: "Schließen", exact: true }).last().click(); await page.waitForTimeout(300);
  // remove dialog
  await page.getByRole("button", { name: "Cleo Brunner aus der Klasse entfernen" }).click(); await page.waitForTimeout(400); await shot(page, "dialog-remove-1280", false);
  await page.getByRole("button", { name: "Abbrechen" }).click();
  // invite flow
  await tabTo(page, /Einladen/);
  const ok = await page.evaluate(async () => { if (!("BarcodeDetector" in window)) return "no-detector"; const svg = document.querySelector('svg[role="img"]'); const s = new XMLSerializer().serializeToString(svg); const img = new Image(); img.src = "data:image/svg+xml;base64," + btoa(s); await img.decode(); const c = document.createElement("canvas"); c.width = c.height = 400; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 400); g.drawImage(img, 0, 0, 400, 400); const r = await new BarcodeDetector({ formats: ["qr_code"] }).detect(c); return r[0]?.rawValue ?? "undecoded"; });
  console.log("QR decode:", ok);
  if (ok !== "no-detector" && !ok.endsWith("/classes/join/KLAS-7Q2")) problems.push("QR decode mismatch: " + ok);
  await page.getByLabel("E-Mail-Adressen").fill("a@schule.ch, b@schule.ch\nkaputt");
  await page.getByRole("button", { name: "Einladungen erstellen" }).click(); await page.waitForSelector("text=persönliche Links bereit"); await page.waitForTimeout(400); await shot(page, "invite-created-1280");
  await page.getByRole("button", { name: /Einladung für lea@schule.ch widerrufen/ }).click(); await page.waitForTimeout(500);
  if (!stub.calls.some((c) => c.rpc === "class_invite_revoke")) problems.push("revoke not called");
  // announcement
  await tabTo(page, /Mitteilungen/); await page.getByLabel("Nachricht").fill("Test-Mitteilung"); await page.getByRole("button", { name: "Veröffentlichen" }).click(); await page.waitForSelector("text=Test-Mitteilung");
  // settings: delete confirm
  await tabTo(page, /Einstellungen/); await page.getByRole("button", { name: "Klasse löschen" }).click(); await page.waitForTimeout(400); await shot(page, "dialog-delete-1280", false);
});
await session({ w: 375, h: 812, dark: true }, async (page) => {
  await go(page, "/teacher/classes/c1", "text=Anna Meier");
  await page.getByRole("button", { name: "Erinnern" }).first().click(); await page.waitForTimeout(400); await shot(page, "dialog-nudge-375-dark", false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (overflow > 1) problems.push(`horizontal overflow ${overflow}px at 375`);
});
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "ALL CHECKS PASSED");
process.exit(problems.length ? 1 : 0);
