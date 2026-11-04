// Headless check of the profile picture flow against a stubbed Supabase (nothing real is touched).
// Usage: start `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy next dev --webpack -p 3191`, then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/avatar-e2e.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3191";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/avatar/`;
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "anna@x.ch", user_metadata: { full_name: "Anna Keller", role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };

async function run(name, vp, dark) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(([s, d]) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); if (d) localStorage.setItem("wendapply-theme", "dark"); }, [session, dark]);
  const db = { avatar: null, uploads: [], removed: [], profile: { id: "profile-u1", user_id: "u1", first_name: "Anna", last_name: "Keller", email: "anna@x.ch" } };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p.startsWith("/storage/v1/object/public/avatars") && db.image) return route.fulfill({ status: 200, contentType: db.imageType, headers: { "access-control-allow-origin": "*" }, body: db.image });
    if (p.startsWith("/storage/v1/object/avatars")) {
      if (method === "POST" || method === "PUT") {
        const raw = req.postDataBuffer(); const text = raw.toString("latin1"); const start = text.indexOf("\r\n\r\n", text.indexOf("Content-Type: image/")) + 4; const end = text.lastIndexOf("\r\n------");
        db.image = raw.subarray(start, end); db.imageType = (text.match(/Content-Type: (image\/\w+)/) ?? [])[1];
        db.uploads.push({ path: p, type: (req.postDataBuffer()?.toString("latin1").match(/Content-Type: (image\/\w+)/) ?? [])[1], bytes: req.postDataBuffer()?.length }); return json({ Key: p }); }
      if (method === "DELETE") { db.removed.push(req.postData()); return json([]); }
    }
    if (p === "/rest/v1/profiles") {
      if (method === "PATCH") { const body = req.postDataJSON(); db.avatar = body.avatar_url; return json([{ id: "profile-u1" }]); }
      if (method === "GET") return json({ ...db.profile, avatar_url: db.avatar });
    }
    if (p.startsWith("/rest/v1/rpc/")) return json([]);
    return json([]);
  });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/profile");
  await page.getByRole("heading", { name: "Profilbild" }).waitFor();
  await page.screenshot({ path: `${OUT}${name}-1-profile.png` });
  const input = page.getByTestId("avatar-file");

  // Wrong type and too large -> clear German errors
  await input.setInputFiles({ name: "x.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  assert.match(await page.getByText(/Format wird nicht unterstützt/).innerText(), /PNG/);
  await input.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 10) });
  await page.getByText(/größer als 5 MB/).waitFor();
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await page.getByText(/konnte nicht gelesen werden/).waitFor();

  // Real picture: 1600x1000 gradient
  const dataUrl = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 1600; c.height = 1000; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 1600, 1000); g.addColorStop(0, "#f97316"); g.addColorStop(1, "#2563eb"); x.fillStyle = g; x.fillRect(0, 0, 1600, 1000); x.fillStyle = "#fff"; x.beginPath(); x.arc(560, 420, 120, 0, 7); x.fill(); x.fillStyle = "#111"; x.fillRect(700, 600, 400, 60); x.font = "bold 220px sans-serif"; x.fillText("A", 900, 400); return c.toDataURL("image/png"); });
  await input.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  const crop = page.getByTestId("avatar-crop"); await crop.waitFor();
  const box = await crop.boundingBox();
  await page.getByRole("slider", { name: "Zoom" }).fill("2");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 5 }); await page.mouse.up();
  console.log(name, "crop img:", await page.evaluate(() => { const i = document.querySelector("[data-testid=avatar-crop] img"); return i && { w: i.naturalWidth, st: i.getAttribute("style"), src: i.src.slice(0, 30) }; }));
  await page.screenshot({ path: `${OUT}${name}-2-crop.png` });
  for (const el of await page.locator("[role=dialog] button").all()) { const b = await el.boundingBox(); if (b && (await el.isVisible())) assert.ok(b.height >= 39 && b.width >= 39, "touch target " + (await el.innerText()) + " " + b.width + "x" + b.height); }
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.getByText("Dein Profilbild wurde gespeichert.").waitFor();
  assert.equal(db.uploads.length, 1);
  assert.match(db.uploads[0].path, /u1\/avatar\.(webp|jpg)$/);
  assert.match(db.uploads[0].type, /image\/(webp|jpeg)/);
  assert.ok(db.uploads[0].bytes < 120000, "compressed " + db.uploads[0].bytes);
  assert.match(db.avatar, /\/avatars\/u1\/avatar\.(webp|jpg)\?v=\d+/);
  await page.waitForFunction(() => [...document.querySelectorAll("header img")].some((i) => i.alt === "" && i.naturalWidth > 0 && i.src.includes("/avatars/")));
  const imgs = await page.locator('header img[src*="/avatars/"]').count();
  console.log(name, "upload bytes:", db.uploads[0].bytes, "type:", db.uploads[0].type, "header avatar img:", imgs);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}${name}-3-saved.png` });

  // Remove -> initials again
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Entfernen" }).click();
  await page.getByText("Dein Profilbild wurde entfernt.").waitFor();
  assert.equal(db.avatar, null);
  console.log(name, "console errors:", logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 5));
  await browser.close();
}
await run("desktop", { w: 1280, h: 860 }, false);
await run("mobile", { w: 390, h: 844 }, false);
await run("mobile-dark", { w: 390, h: 844 }, true);
