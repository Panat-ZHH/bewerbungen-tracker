// Stateful in-memory stand-in for Supabase (auth, PostgREST tables, RPCs, storage) used by the headless E2E runner.
// Nothing real is ever contacted: Playwright intercepts every request to SUPABASE_URL (http://localhost:54321).
// Usage: const mock = createMockSupabase({ role: "student", apps: [...] }); await mock.install(context);
// mock.state holds the data (mutated by the app), mock.calls logs every REST/RPC call.

export const SUPABASE_URL = "http://localhost:54321";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

export function makeUser(role = "student") {
  const teacher = role === "teacher";
  return { id: teacher ? "t1" : "u1", aud: "authenticated", role: "authenticated", email: teacher ? "lehrer@beispiel.ch" : "lena@beispiel.ch", user_metadata: { role, full_name: teacher ? "Herr Keller" : "Lena Müller" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
}
export function makeSession(user) { return { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user }; }

export function makeApplication(i, overrides = {}) {
  const statuses = ["saved", "preparing", "applied", "interview", "final_interview", "offer", "rejected", "withdrawn"];
  return { id: `a${i}`, user_id: "u1", company: `Firma ${i}`, position: `Stelle ${i}`, location: "Bern", status: statuses[i % statuses.length], category: "software", currency: "CHF", deadline: day(i + 3), created_at: day(-20 + i), updated_at: day(-i), applied_at: null, job_url: null, source: null, salary_min: null, salary_max: null, match_score: 60, cv_type: "developer", job_description: null, notes: null, ...overrides };
}

export function createMockSupabase({ role = "student", authed = true, apps = [], cvs = [], profile = null, shop = {}, unlocked = 1, friends = true, classes = true } = {}) {
  const user = makeUser(role);
  const session = makeSession(user);
  const state = {
    authed, user, role,
    apps: apps.map((a) => ({ ...a })),
    cvs: cvs.map((c) => ({ ...c })),
    profiles: profile ? [{ id: `profile-${user.id}`, user_id: user.id, ...profile }] : [],
    shop: { balance: 3500, earned: 3500, rewardCount: 35, items: [], layouts: [], ...shop },
    unlocked,
    connections: friends ? [
      { id: "f1", other_user_id: "u2", display_name: "Marco Bianchi", avatar_seed: "m", role: "student", state: "friend", created_at: day(-30) },
      { id: "f2", other_user_id: "u3", display_name: "Sara Weber", avatar_seed: "s", role: "student", state: "incoming", created_at: day(-2) },
      { id: "f3", other_user_id: "u4", display_name: "Tim Egger", avatar_seed: "t", role: "student", state: "outgoing", created_at: day(-1) },
    ] : [],
    social: { display_name: user.user_metadata.full_name, avatar_seed: "x", invite_code: "LENA4821", share_with_friends: true },
    classes: classes && role === "teacher" ? [{ id: "c1", name: "Informatik 4a", school_year: "2026/27", join_code: "KLAS7Q2", created_at: day(-60), member_count: 3 }] : [],
    memberships: classes && role === "student" ? [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: true, joined_at: day(-50) }] : [],
    students: [
      { student_id: "s1", display_name: "Anna Meier", avatar_seed: "s1", hidden: false, total: 5, status_counts: { applied: 3, offer: 1, rejected: 1 }, last_7_days: 2, last_30_days: 5, latest_company: "Swisscom", latest_position: "Informatiker", latest_status: "offer", latest_date: day(-1) },
      { student_id: "s2", display_name: "Ben Huber", avatar_seed: "s2", hidden: false, total: 1, status_counts: { saved: 1 }, last_7_days: 0, last_30_days: 1, latest_company: "UBS", latest_position: "Praktikum", latest_status: "saved", latest_date: day(-20) },
      { student_id: "s3", display_name: "Chiara Rossi", avatar_seed: "s3", hidden: true, total: 0, status_counts: {}, last_7_days: 0, last_30_days: 0, latest_company: null, latest_position: null, latest_status: null, latest_date: null },
    ],
    failNextAuth: false,
  };
  const calls = [];
  const dbError = (message, code = "P0001") => ({ code, message, details: null, hint: null });

  function applyFilters(rows, params) {
    let out = rows;
    for (const [key, value] of params) {
      if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) continue;
      if (value.startsWith("eq.")) { const v = value.slice(3); out = out.filter((r) => String(r[key]) === v); }
      else if (value.startsWith("in.")) { const set = value.slice(4, -1).split(","); out = out.filter((r) => set.includes(String(r[key]))); }
    }
    const order = params.get("order");
    if (order) { const [col, dir] = order.split("."); out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1)); }
    return out;
  }

  const tables = { applications: () => state.apps, cvs: () => state.cvs, profiles: () => state.profiles };
  const setTable = (name, rows) => { if (name === "applications") state.apps = rows; else if (name === "cvs") state.cvs = rows; else state.profiles = rows; };

  function rest(table, method, params, body, headers) {
    const rows = tables[table]?.();
    if (!rows) return { status: 200, body: [] };
    const single = (headers.accept || "").includes("vnd.pgrst.object");
    const wantsRows = (headers.prefer || "").includes("return=representation") || method === "GET";
    const shape = (list) => (single ? (list[0] ?? null) : list);
    const noRow = () => ({ status: 406, body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null } });
    if (method === "GET") { const out = applyFilters(rows, params); if (single && !out.length) return noRow(); return { status: 200, body: shape(out) }; }
    if (method === "POST") {
      const incoming = (Array.isArray(body) ? body : [body]).map((r) => ({ ...r }));
      const upsert = (headers.prefer || "").includes("resolution=merge-duplicates");
      const result = [];
      for (const row of incoming) {
        const idx = rows.findIndex((r) => r.id === row.id);
        if (idx >= 0) { if (!upsert) return { status: 409, body: dbError("duplicate key value violates unique constraint", "23505") }; rows[idx] = { ...rows[idx], ...row }; result.push(rows[idx]); }
        else { rows.push(row); result.push(row); }
      }
      return { status: 201, body: wantsRows ? shape(result) : null };
    }
    if (method === "PATCH") {
      const targets = applyFilters(rows, params);
      for (const r of targets) Object.assign(r, body);
      if (single && !targets.length) return noRow();
      return { status: wantsRows ? 200 : 204, body: wantsRows ? shape(targets) : null };
    }
    if (method === "DELETE") {
      const targets = applyFilters(rows, params);
      setTable(table, rows.filter((r) => !targets.includes(r)));
      return { status: 204, body: null };
    }
    return { status: 200, body: [] };
  }

  const price = { road: 20, flowers: 30, tree: 40, bench: 50, fountain: 150, amusement_park: 500 };
  function rpc(name, b) {
    switch (name) {
      case "social_my_profile": return [{ user_id: user.id, role, display_name: state.social.display_name, avatar_seed: state.social.avatar_seed, invite_code: state.social.invite_code, share_with_friends: state.social.share_with_friends, email: user.email }];
      case "social_update_profile": Object.assign(state.social, { ...(b.p_display_name ? { display_name: b.p_display_name } : {}), ...(b.p_avatar_seed ? { avatar_seed: b.p_avatar_seed } : {}), ...(b.p_share_with_friends !== null && b.p_share_with_friends !== undefined ? { share_with_friends: b.p_share_with_friends } : {}) }); return rpc("social_my_profile", {});
      case "social_list": return state.connections;
      case "social_friends_overview": return state.connections.filter((c) => c.state === "friend").map((c) => ({ user_id: c.other_user_id, display_name: c.display_name, avatar_seed: c.avatar_seed, shared: true, total: 4, status_counts: { applied: 3, interview: 1 }, map_points_earned: 400, map_items: 2 }));
      case "social_find_by_code": return String(b.p_code).toUpperCase() === "FREUND42" ? [{ display_name: "Frida Freund", avatar_seed: "f", role: "student", invite_code: "FREUND42", relation: "none" }] : [];
      case "social_send_request": {
        const key = String(b.p_code_or_email).trim().toLowerCase();
        if (key === state.social.invite_code.toLowerCase() || key === user.email) throw dbError("CANNOT_ADD_SELF");
        if (!["freund42", "frida@beispiel.ch"].includes(key)) throw dbError("USER_NOT_FOUND");
        if (state.connections.some((c) => c.other_user_id === "u9")) throw dbError("REQUEST_PENDING");
        const row = { id: "f9", other_user_id: "u9", display_name: "Frida Freund", avatar_seed: "f", role: "student", state: "outgoing", created_at: day(0) };
        state.connections.push(row); return [{ id: "f9", status: "pending" }];
      }
      case "social_respond_request": { const c = state.connections.find((x) => x.id === b.p_request_id); if (!c) throw dbError("NOT_FOUND"); if (b.p_accept) c.state = "friend"; else state.connections = state.connections.filter((x) => x !== c); return b.p_accept ? "accepted" : "declined"; }
      case "social_remove_friend": state.connections = state.connections.filter((x) => x.id !== b.p_friendship_id); return null;
      case "map_friend_island": throw dbError("NOT_FRIENDS");
      case "class_list_mine": return state.classes;
      case "class_create": { const c = { id: `c${state.classes.length + 1}`, name: b.p_name, school_year: b.p_school_year || "", join_code: `KLAS${state.classes.length + 1}XY`, created_at: day(0), member_count: 0 }; state.classes.push(c); return [c]; }
      case "class_overview": return state.students;
      case "class_members": return state.students.map((s) => ({ student_id: s.student_id, display_name: s.display_name, avatar_seed: s.avatar_seed, joined_at: day(-50), hidden: s.hidden }));
      case "class_student_applications": return state.apps.length ? state.apps.map((a) => ({ hidden: false, id: a.id, company: a.company, position: a.position, status: a.status, category: a.category, location: a.location, deadline: a.deadline, applied_at: a.applied_at, created_at: a.created_at, updated_at: a.updated_at })) : [{ hidden: false, id: "x1", company: "Swisscom", position: "Informatiker", status: "offer", category: "software", location: "Bern", deadline: null, applied_at: day(-5), created_at: day(-9), updated_at: day(-1) }];
      case "class_my_classes": return state.memberships;
      case "class_preview": { if (String(b.p_code).toUpperCase() !== "KLAS7Q2") throw dbError("CLASS_NOT_FOUND"); return [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", member_count: 3, already_member: state.memberships.length > 0 }]; }
      case "class_join": { if (String(b.p_code).toUpperCase() !== "KLAS7Q2") throw dbError("CLASS_NOT_FOUND"); const m = { class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: false, joined_at: day(0) }; if (!state.memberships.length) state.memberships.push(m); return [m]; }
      case "class_set_sharing": { const m = state.memberships.find((x) => x.class_id === b.p_class_id); if (m) m.share_applications = !!b.p_share; return null; }
      case "class_leave": state.memberships = state.memberships.filter((x) => x.class_id !== b.p_class_id); return null;
      case "class_rename": { const c = state.classes.find((x) => x.id === b.p_class_id); if (c) { c.name = b.p_name; if (b.p_school_year) c.school_year = b.p_school_year; } return null; }
      case "class_delete": state.classes = state.classes.filter((x) => x.id !== b.p_class_id); return null;
      case "class_remove_student": state.students = state.students.filter((s) => s.student_id !== b.p_student_id); return null;
      case "class_regenerate_code": { const c = state.classes.find((x) => x.id === b.p_class_id); if (c) c.join_code = "NEUCODE9"; return "NEUCODE9"; }
      case "map_shop_state": return state.shop;
      case "map_shop_buy": {
        const cost = price[b.p_item_type]; if (cost === undefined) throw dbError("UNKNOWN_ITEM");
        if (state.shop.balance < cost) throw dbError("INSUFFICIENT_POINTS");
        if (!state.shop.items.some((i) => i.id === b.p_request_id)) { state.shop.balance -= cost; state.shop.items.push({ id: b.p_request_id, itemType: b.p_item_type, x: null, z: null, rotation: 0, createdAt: day(0) }); }
        return state.shop;
      }
      case "map_shop_place": { const it = state.shop.items.find((i) => i.id === b.p_item_id); if (!it) throw dbError("ITEM_NOT_FOUND"); it.x = b.p_x ?? null; it.z = b.p_z ?? null; it.rotation = b.p_rotation ?? 0; return state.shop; }
      case "map_move_object": state.shop.layouts = state.shop.layouts.filter((l) => l.id !== b.p_object_id); state.shop.layouts.push({ id: b.p_object_id, x: b.p_x, z: b.p_z, rotation: b.p_rotation }); return state.shop;
      case "map_islands_state": return { unlocked: state.unlocked };
      case "map_island_unlock": { const p = { 2: 600, 3: 1500, 4: 3000 }[b.p_island_no]; if (b.p_island_no === state.unlocked + 1 && state.shop.balance >= p) { state.shop.balance -= p; state.unlocked += 1; } return { unlocked: state.unlocked }; }
      default: return [];
    }
  }

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const p = url.pathname;
    const headers = req.headers();
    const reply = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { ...CORS, "content-range": "0-0/*" }, body: body === null || body === undefined ? "" : JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    let body = {};
    try { body = req.postDataJSON() ?? {}; } catch { body = {}; }
    if (p.startsWith("/auth/v1/")) {
      calls.push({ kind: "auth", method, path: p });
      if (p.startsWith("/auth/v1/user")) return state.authed ? reply(200, state.user) : reply(401, { code: 401, msg: "Auth session missing!" });
      if (p.startsWith("/auth/v1/token")) {
        if (state.failNextAuth || body.password === "falsch") return reply(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials", error: "invalid_grant", error_description: "Invalid login credentials" });
        state.authed = true; return reply(200, session);
      }
      if (p.startsWith("/auth/v1/signup")) return reply(200, { ...state.user, identities: [{}] });
      if (p.startsWith("/auth/v1/logout")) { state.authed = false; return route.fulfill({ status: 204, headers: CORS }); }
      return reply(200, {});
    }
    if (p.startsWith("/storage/")) { calls.push({ kind: "storage", method, path: p }); if (p.includes("/object/sign")) return reply(200, { signedURL: "/storage/v1/object/sign/cvs/x?token=t" }); return reply(200, []); }
    if (p.startsWith("/rest/v1/rpc/")) {
      const name = p.split("/").pop();
      calls.push({ kind: "rpc", name, body });
      try { return reply(200, rpc(name, body)); } catch (error) { if (error && error.message) return reply(400, error); throw error; }
    }
    if (p.startsWith("/rest/v1/")) {
      const table = p.split("/").pop();
      calls.push({ kind: "rest", method, table, query: url.search, body });
      const out = rest(table, method, url.searchParams, body, headers);
      return reply(out.status, out.body);
    }
    return reply(200, []);
  }

  return {
    state, calls, user, session, handle,
    /** Registers the session in localStorage (when authed) and intercepts Supabase + the job-search API. */
    async install(context) {
      if (state.authed) await context.addInitScript((s) => { if (!localStorage.getItem("sb-localhost-auth-token")) localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
      await context.route(`${SUPABASE_URL}/**`, handle);
      await context.route("**/api/job-search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [], nextCursor: null, updates: [], complete: true }) }));
    },
    rpcCalls(name) { return calls.filter((c) => c.kind === "rpc" && (!name || c.name === name)); },
  };
}
