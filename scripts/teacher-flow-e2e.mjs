// Teacher-role flow checks (roles, routing, onboarding, student class UI) against the Supabase stub. Nothing real is touched.
// PLAYWRIGHT=... CHROME=... [BASE=http://localhost:3201] node scripts/teacher-flow-e2e.mjs
import fs from "node:fs";
import { BASE, installStub, launch, newCtx, makeUser } from "./ux-v2-stub.mjs";
const OUT = `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/teacher-flow/`; fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, text) => { console.log(ok ? "PASS" : "FAIL", text); if (!ok) fails++; };
const browser = await launch();
const iso = (d) => new Date(Date.now() + d * 864e5).toISOString();
const MEMBER = (o = {}) => ({ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: true, share_companies: true, joined_at: iso(-50), last_nudge_at: iso(-2), announcements_count: 2, ...o });
const NOTIFS = [{ id: "n1", kind: "nudge", class_id: "c1", class_name: "Informatik 4a", message: "Schick diese Woche mindestens zwei Bewerbungen ab.", created_at: iso(-2), read: false }, { id: "n2", kind: "announcement", class_id: "c1", class_name: "Informatik 4a", message: "Bewerbungsworkshop am Freitag, 10:00 Uhr.", created_at: iso(-6), read: true }];
const VIS = { teacher_sees: ["Firmenname und Position (wenn freigegeben)", "Status deiner Bewerbungen", "Fristen und Termine"], teacher_never_sees: ["Notizen", "Gehalt", "Lebenslauf und Dokumente", "Kontakte und Links"] };

async function session({ meta, role = "student", opts = {}, vp = {} }) {
  const ctx = await newCtx(browser, vp);
  const state = await installStub(ctx, { role, ...opts });
  if (meta) { // replace the stub user's metadata (e.g. Google login without role)
    const who = makeUser(role); who.user.user_metadata = meta; who.session.user = who.user;
    await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), who.session);
    await ctx.route("http://localhost:54321/auth/v1/user", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: JSON.stringify(who.user) }));
  }
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  return { ctx, state, page, errors };
}
const path = (page) => new URL(page.url()).pathname;
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
async function scenario(name, fn) { try { await fn(); } catch (e) { check(false, `${name}: threw ${String(e.message).split("\n")[0]}`); } }
const rpcOpts = (extra = {}) => ({ rpc: { class_my_classes: [MEMBER()], my_notifications: NOTIFS, class_visibility_info: VIS, class_announcement_list: [{ id: "a1", text: "Bewerbungsworkshop am Freitag.", created_at: iso(-1), author_name: "Herr Keller" }], ...extra } });

await scenario("routing-student", async () => {
  const { ctx, page } = await session({ opts: rpcOpts() });
  await page.goto(BASE + "/teacher/onboarding"); await page.waitForURL("**/dashboard");
  check(path(page) === "/dashboard", "student visiting /teacher/** -> /dashboard");
  await ctx.close();
});

await scenario("routing-teacher", async () => {
  const { ctx, page, state } = await session({ role: "teacher", opts: { rpc: { class_list_mine: [{ id: "c1", name: "Informatik 4a", school_year: "2026/27", join_code: "KLAS7Q2A", created_at: iso(-60), member_count: 3 }] } } });
  await page.goto(BASE + "/map"); await page.waitForURL((u) => u.pathname.startsWith("/teacher"));
  check(path(page) === "/teacher", "teacher visiting /map -> /teacher");
  await page.goto(BASE + "/applications"); await page.waitForURL((u) => u.pathname.startsWith("/teacher"));
  check(path(page) === "/teacher", "teacher visiting /applications -> /teacher");
  await page.goto(BASE + "/"); await page.waitForURL((u) => u.pathname.startsWith("/teacher"));
  check(path(page) === "/teacher", "/ with teacher session -> /teacher");
  void state; await ctx.close();
});

await scenario("teacher-nav", async () => {
  for (const [w, h, dark, tag] of [[1280, 800, false, "desktop"], [375, 812, false, "mobile"], [375, 812, true, "mobile-dark"]]) {
    const { ctx, page } = await session({ role: "teacher", meta: { role: "teacher", teacher_onboarded: true }, opts: { rpc: { class_list_mine: [{ id: "c1", name: "Informatik 4a", school_year: "2026/27", join_code: "KLAS7Q2A", created_at: iso(-60), member_count: 3 }] } }, vp: { w, h, dark } });
    await page.goto(BASE + "/classes"); await page.getByText("Informatik 4a").first().waitFor();
    const nav = page.getByRole("navigation", { name: w < 700 ? "Hauptmenü mobil" : "Hauptmenü" });
    const labels = (await nav.getByRole("link").allInnerTexts()).join("|") + (await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.getAttribute("title") || "").join("|")));
    check(/Übersicht/.test(labels) && /Klassen/.test(labels) && !/Bewerbungen|Map|Lebensläufe/.test(labels), `teacher menu (${tag}): ${labels.replace(/\n/g, " ")}`);
    await shot(page, `teacher-classes-${tag}`); await ctx.close();
  }
});

await scenario("onboarding", async () => {
  for (const [w, h, dark, tag] of [[375, 812, false, "mobile"], [375, 812, true, "mobile-dark"], [1280, 800, false, "desktop"]]) {
    const { ctx, page, state } = await session({ role: "teacher", meta: { role: "teacher" }, opts: { rpc: { class_list_mine: [], social_update_profile: [{ user_id: "t1", role: "teacher", display_name: "Frau Keller", avatar_seed: "x", invite_code: "T-1", share_with_friends: true, email: "t@x.ch" }], class_create: [{ id: "c9", name: "Mediamatik 3b", school_year: "2026/27", join_code: "ABCD2345", created_at: iso(0), member_count: 0 }] } }, vp: { w, h, dark } });
    await page.goto(BASE + "/teacher/onboarding");
    await page.getByRole("heading", { name: /Willkommen/ }).waitFor(); await shot(page, `onboarding-1-role-${tag}`);
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByLabel("Anzeigename").waitFor(); await shot(page, `onboarding-2-name-${tag}`);
    await page.getByLabel("Anzeigename").fill("Frau Keller"); await page.getByRole("button", { name: /Weiter/ }).click();
    await page.getByLabel("Klassenname").waitFor(); await page.getByLabel("Klassenname").fill("Mediamatik 3b");
    await shot(page, `onboarding-3-class-${tag}`);
    await page.getByRole("button", { name: "Klasse erstellen" }).click();
    await page.getByText("ABCD2345").waitFor(); await shot(page, `onboarding-4-done-${tag}`);
    check(state.calls.some((c) => c.rpc === "class_create" && c.body.p_name === "Mediamatik 3b") && state.calls.some((c) => c.rpc === "social_update_profile" && c.body.p_display_name === "Frau Keller"), `onboarding saved name + class (${tag})`);
    await ctx.close();
  }
});

await scenario("role-picker", async () => {
  for (const [dark, tag] of [[false, "light"], [true, "dark"]]) {
    const { ctx, page, state } = await session({ role: "student", meta: { full_name: "Lena Müller", avatar_url: "x" }, opts: rpcOpts(), vp: { w: 375, h: 812, dark } });
    await page.goto(BASE + "/dashboard"); await page.waitForURL("**/auth/role**");
    check(path(page) === "/auth/role", `Google user without role is asked once (${tag})`);
    await page.getByText("Ich begleite Klassen").click(); await shot(page, `role-picker-${tag}`);
    await page.getByText("Ich suche eine Lehrstelle").click(); await page.getByRole("button", { name: "Weiter" }).click();
    await page.waitForURL("**/dashboard");
    check(state.calls.some((c) => c.rpc === "set_my_role" && c.body.p_role === "student"), `set_my_role called, then /dashboard (${tag})`);
    await ctx.close();
  }
});

await scenario("join", async () => {
  const token = "Xk3_9aBcDeFgHiJkLmNoPq";
  const { ctx, page, state } = await session({ opts: rpcOpts({ class_invite_preview: [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", member_count: 6, already_member: false, valid: true, reason: null }], class_invite_accept: [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: true, joined_at: iso(0) }] }), vp: { w: 375, h: 812 } });
  await page.goto(BASE + `/classes/join/${token}`); await page.getByRole("button", { name: /Beitreten/ }).waitFor();
  check(state.calls.some((c) => c.rpc === "class_invite_preview" && c.body.p_token === token), "token link previews via class_invite_preview (case kept)");
  await page.getByText("Was Herr Keller sieht").waitFor(); await shot(page, "join-token-mobile");
  await page.getByRole("button", { name: /Beitreten/ }).click(); await page.getByText("Du bist beigetreten").waitFor();
  check(state.calls.some((c) => c.rpc === "class_invite_accept" && c.body.p_token === token), "accept via class_invite_accept");
  await page.goto(BASE + "/classes/join/abc12345"); await page.getByRole("button", { name: /Beitreten/ }).waitFor();
  check(state.calls.some((c) => c.rpc === "class_preview" && c.body.p_code === "ABC12345"), "short code uses class_preview (upper-cased)");
  await ctx.close();
  const bad = await session({ opts: rpcOpts({ class_invite_preview: [{ class_id: null, name: null, school_year: null, teacher_name: null, member_count: null, already_member: false, valid: false, reason: "EXPIRED" }] }), vp: { w: 375, h: 812, dark: true } });
  await bad.page.goto(BASE + `/classes/join/${token}`); await bad.page.getByText(/abgelaufen/).first().waitFor(); await shot(bad.page, "join-expired-dark");
  await bad.ctx.close();
  const out = await session({ opts: { authed: false } });
  const o = await out.ctx.newPage(); await o.goto(BASE + `/classes/join/${token}`); await o.waitForURL("**/login**");
  check(decodeURIComponent(o.url()).includes(`next=/classes/join/${token}`), "logged out -> login with next=join link");
  await out.ctx.close();
});

await scenario("student-classes", async () => {
  for (const [w, h, dark, tag] of [[375, 812, false, "mobile"], [375, 812, true, "mobile-dark"], [1280, 900, false, "desktop"]]) {
    const { ctx, page, state } = await session({ opts: rpcOpts(), vp: { w, h, dark } });
    await page.goto(BASE + "/classes"); await page.getByText("Informatik 4a").first().waitFor();
    await page.getByRole("switch", { name: /Firmennamen/ }).waitFor({ state: "attached" });
    await page.getByText(/2 Mitteilungen/).click(); await page.getByText("Bewerbungsworkshop am Freitag.").waitFor();
    await shot(page, `student-classes-${tag}`);
    if (tag === "mobile") {
      await page.getByText("Firmennamen zeigen").click();
      await page.waitForTimeout(300);
      check(state.calls.some((c) => c.rpc === "class_set_sharing_v2" && c.body.p_share === true && c.body.p_companies === false), "company-name switch -> class_set_sharing_v2(share=true, companies=false)");
      await page.getByText("Fortschritt mit Lehrperson teilen").click(); await page.waitForTimeout(300);
      check(state.calls.some((c) => c.rpc === "class_set_sharing_v2" && c.body.p_share === false), "master switch off -> share=false");
      check(await page.getByRole("switch", { name: /Firmennamen/ }).isDisabled(), "company switch disabled while master is off");
    }
    await page.getByRole("button", { name: /Mitteilungen/ }).first().click(); await page.getByText("Schick diese Woche").waitFor(); await shot(page, `notifications-${tag}`);
    if (tag === "mobile") { await page.getByText("Schick diese Woche").click(); await page.waitForTimeout(200); check(state.calls.some((c) => c.rpc === "mark_notification_read" && c.body.p_id === "n1"), "notification click -> mark_notification_read"); }
    await ctx.close();
  }
});

await scenario("join-modal-leave", async () => {
  const { ctx, page, state } = await session({ opts: rpcOpts(), vp: { w: 375, h: 812 } });
  await page.goto(BASE + "/classes"); await page.getByText("Informatik 4a").first().waitFor();
  await page.getByRole("button", { name: "Klasse verlassen" }).click(); await page.getByRole("button", { name: "Verlassen", exact: true }).click(); await page.waitForTimeout(300);
  check(state.calls.some((c) => c.rpc === "class_leave"), "leave class -> class_leave");
  await ctx.close();
});

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS"); await browser.close(); process.exit(fails ? 1 : 0);
