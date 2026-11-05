// Shared harness for the v2 UX audit: stateful Supabase stub (nothing real is touched) + browser launcher.
// Env: PLAYWRIGHT=<playwright-core/index.mjs>, CHROME=<chrome binary>, BASE (default http://localhost:3201)
export const BASE = process.env.BASE || "http://localhost:3201";
export const SHOTS = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/v2/ux/`;
const SUPA = "http://localhost:54321";
const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

export function makeUser(role = "student") {
  const user = { id: role === "teacher" ? "t1" : "u1", aud: "authenticated", role: "authenticated", email: `${role}@beispiel.ch`, user_metadata: { role }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  return { user, session: { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user } };
}
export function seedApps() {
  return [
    ["a1", "Swisscom", "Applikationsentwickler:in EFZ", "Zürich", "interview", 0], ["a2", "UBS", "Praktikum Finanzen", "Zürich", "applied", 5],
    ["a3", "Migros", "Informatikerin EFZ", "Bern", "preparing", 14], ["a4", "Google", "Software Engineering Intern", "Zürich", "saved", 3],
    ["a5", "Post", "Mediamatikerin", "Bern", "rejected", 40], ["a6", "ZKB", "Kaufmann/-frau EFZ", "Zürich", "offer", 9],
  ].map(([id, company, position, location, status, dl], i) => ({ id, user_id: "u1", company, position, location, status, category: "other", currency: "CHF", deadline: iso(dl || 1), created_at: iso(-30 + i), updated_at: iso(-i), applied_at: ["applied", "interview", "offer", "rejected"].includes(status) ? iso(-10) : null, match_score: 50, notes: "Rückruf am Donnerstag." }));
}
const CVS = [{ id: "cv1", user_id: "u1", name: "Technik", type: "developer", status: "Ready", description: "Aktueller Lebenslauf", updated_at: iso(-3), file_name: "cv.pdf", storage_path: "u1/cv1/cv.pdf", file_type: "application/pdf", file_size: 1000 }, { id: "cv2", user_id: "u1", name: "Allgemein", type: "other", status: "Draft", description: "", updated_at: iso(-3), file_name: null, storage_path: null, file_type: null, file_size: null }];

/** opts: role, authed, apps (array), failWrites (status code), failReads, social ('empty'|'full'), calls[] */
export async function installStub(ctx, opts = {}) {
  const { role = "student", authed = true } = opts;
  const who = makeUser(role);
  const state = { apps: opts.apps ?? seedApps(), calls: [], profile: null, cvs: structuredClone(CVS) };
  if (authed) await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), who.session);
  await ctx.route("**/api/job-search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ title: "Informatiker/in EFZ", company: "Swisscom", location: "Zürich", url: "https://example.com/1", source: "jobs.ch" }], nextCursor: null, updates: [], complete: true }) }));
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method(); const p = url.pathname;
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { ...cors, "content-range": "0-0/*" }, body: JSON.stringify(b) });
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (p.startsWith("/auth/v1/user")) return authed ? json(who.user) : json({ msg: "no" }, 401);
    if (p.startsWith("/auth/v1/token")) {
      if (opts.authError) return json({ error: "invalid_grant", error_description: opts.authError, msg: opts.authError, message: opts.authError }, 400);
      return json(who.session);
    }
    if (p.startsWith("/auth/v1/signup")) { if (opts.authError) return json({ code: 422, msg: opts.authError, message: opts.authError }, 422); return json({ id: "new", email: "neu@beispiel.ch", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" }); }
    if (p.startsWith("/auth/v1/recover")) { state.calls.push({ recover: true }); return json({}); }
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: cors });
    if (p.startsWith("/storage/v1/object/sign")) return json({ signedURL: "/storage/v1/object/sign/cvs/x?token=t" });
    if (p.startsWith("/storage/")) { if (opts.failWrites) return json({ message: "boom" }, opts.failWrites); return json({ Key: "x" }); }
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const pick = (rows) => (single ? (rows[0] ?? null) : rows);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      state.calls.push({ rpc, body });
      if (opts.rpc && rpc in opts.rpc) { const r = typeof opts.rpc[rpc] === "function" ? opts.rpc[rpc](body) : opts.rpc[rpc]; if (r && r.__error) return json({ code: "P0001", message: r.__error }, 400); return json(r); }
      return json(rpcData(rpc, role, opts.social ?? "full"));
    }
    if (m !== "GET") {
      state.calls.push({ method: m, rest: p });
      if (opts.failWrites) return json({ code: "XX000", message: "internal server error: relation \"applications\" exploded", details: "secret detail" }, opts.failWrites);
      let body = null; try { body = req.postDataJSON(); } catch {}
      if (p === "/rest/v1/applications") {
        if (m === "POST" && body) { for (const row of [].concat(body)) { state.apps = state.apps.filter((a) => a.id !== row.id); state.apps.push(row); } }
        if (m === "PATCH" && body) { const id = (url.searchParams.get("id") || "").replace("eq.", ""); state.apps = state.apps.map((a) => a.id === id ? { ...a, ...body } : a); }
        if (m === "DELETE") { const id = (url.searchParams.get("id") || "").replace("eq.", ""); if (id) state.apps = state.apps.filter((a) => a.id !== id); else state.apps = []; }
      }
      if (p === "/rest/v1/profiles" && body) state.profile = body;
      return json([], 201);
    }
    if (opts.failReads) return json({ code: "XX000", message: "relation \"applications\" does not exist" }, 500);
    if (p === "/rest/v1/applications") { const id = url.searchParams.get("id"); return json(pick(id ? state.apps.filter((a) => `eq.${a.id}` === id) : [...state.apps].sort((a, b) => b.updated_at.localeCompare(a.updated_at)))); }
    if (p === "/rest/v1/cvs") return json(pick(state.cvs));
    if (p === "/rest/v1/profiles") return json(pick([state.profile ?? { id: "profile-u1", user_id: "u1", first_name: "Lena", last_name: "Müller", email: "lena@beispiel.ch", phone: "", location: "Zürich", website: "", linkedin: "" }]));
    return json([]);
  });
  return state;
}

function rpcData(name, role, social) {
  const empty = social === "empty";
  switch (name) {
    case "social_my_profile": return [{ user_id: role === "teacher" ? "t1" : "u1", role, display_name: "Lena Müller", avatar_seed: "x", invite_code: "LENA-4821", share_with_friends: true, email: `${role}@beispiel.ch` }];
    case "social_list": return empty ? [] : [{ id: "f1", other_user_id: "u2", display_name: "Marco Bianchi", avatar_seed: "m", role: "student", state: "friend", created_at: iso(-30) }, { id: "f2", other_user_id: "u3", display_name: "Sara Weber", avatar_seed: "s", role: "student", state: "incoming", created_at: iso(-2) }, { id: "f3", other_user_id: "u4", display_name: "Tim Egger", avatar_seed: "t", role: "student", state: "outgoing", created_at: iso(-1) }];
    case "social_friends_overview": return empty ? [] : [{ user_id: "u2", display_name: "Marco Bianchi", avatar_seed: "m", shared: true, total: 6, status_counts: { applied: 4, interview: 2 }, map_points_earned: 1200, map_items: 7 }];
    case "social_find_by_code": return [{ display_name: "Lena Müller", avatar_seed: "x", role: "student", invite_code: "LENA-4821", relation: "none" }];
    case "class_list_mine": return empty ? [] : [{ id: "c1", name: "Informatik 4a", school_year: "2026/27", join_code: "KLAS-7Q2", created_at: iso(-60), member_count: 3 }];
    case "class_overview": return [{ student_id: "s1", display_name: "Anna Meier", avatar_seed: "s1", hidden: false, total: 5, status_counts: { applied: 3, offer: 1, rejected: 1 }, last_7_days: 2, last_30_days: 5, latest_company: "Swisscom", latest_position: "Informatiker", latest_status: "applied", latest_at: iso(-1) }, { student_id: "s2", display_name: "Ben Huber", avatar_seed: "s2", hidden: true, total: 0, status_counts: {}, last_7_days: 0, last_30_days: 0 }];
    case "class_members": return [{ student_id: "s1", display_name: "Anna Meier", avatar_seed: "s1", joined_at: iso(-50), hidden: false }];
    case "class_my_classes": return empty ? [] : [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: true, joined_at: iso(-50) }];
    case "class_preview": return [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", member_count: 6, already_member: false }];
    case "class_join": return [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: false, joined_at: iso(0) }];
    case "map_shop_state": return { balance: 340, earned: 1200, rewardCount: 12, items: [], layouts: [] };
    default: return [];
  }
}

export async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  return browser;
}
export async function newCtx(browser, { w = 375, h = 812, dark = false, ...rest } = {}) {
  const mobile = w < 700;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light", ...rest });
  if (dark) await ctx.addInitScript(() => localStorage.setItem("wendapply-theme", "dark"));
  ctx.setDefaultTimeout(30000);
  return ctx;
}
