// Pure helpers for scripts/mobile-responsive-e2e.mjs (device matrix, page lists, issue severity, owner mapping, report).
// No browser, no network: unit-tested in tests/mobile-lib.test.mjs. `auditPage` / `bottomNavCheck` are serialised into the page
// by Playwright (page.evaluate), so they must stay self-contained (no closures over module scope).

// ------------------------------------------------------------------------------------------------ device matrix
/** Registry devices used by the full matrix: [id, playwright registry name, browser]. */
export const REGISTRY_DEVICES = [
  ["iphone-se", "iPhone SE", "webkit"],
  ["iphone-13", "iPhone 13", "webkit"],
  ["iphone-15", "iPhone 15", "webkit"],
  ["iphone-15-pro-max", "iPhone 15 Pro Max", "webkit"],
  ["ipad-7", "iPad (gen 7)", "webkit"],
  ["ipad-7-land", "iPad (gen 7) landscape", "webkit"],
  ["ipad-mini", "iPad Mini", "webkit"],
  ["pixel-5", "Pixel 5", "chromium"],
  ["pixel-7", "Pixel 7", "chromium"],
  ["galaxy-s9plus", "Galaxy S9+", "chromium"],
  ["galaxy-tab-s4", "Galaxy Tab S4", "chromium"],
];
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
/** Galaxy S23 is not in the Playwright registry: 360x780 @3x, touch, mobile. */
export const GALAXY_S23 = { viewport: { width: 360, height: 780 }, screen: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ANDROID_UA, defaultBrowserType: "chromium" };
export const PLAIN_WIDTHS = [320, 360, 375, 390, 412, 430, 600, 768, 1024];
export const LANDSCAPES = [[844, 390], [932, 430]];
/** Height for a plain width: phone-like aspect below 600, tablet-ish above. */
export const heightFor = (w) => (w <= 430 ? Math.round(w * 2.16) : w <= 768 ? 1024 : 768);

/**
 * Builds the device list. `registry` = playwright-core's `devices` export.
 * Each entry: { id, label, browser, options (newContext options), mobile (bottom nav expected), touch }.
 */
export function buildMatrix(registry, { quick = false, only = null } = {}) {
  const out = [];
  const add = (id, label, browser, options) => out.push({ id, label, browser, options, mobile: options.viewport.width < 768, touch: !!options.hasTouch });
  for (const [id, name, browser] of REGISTRY_DEVICES) {
    const d = registry?.[name];
    if (!d) continue;
    const { defaultBrowserType: _ignored, ...options } = d;
    add(id, name, browser, options);
  }
  { const { defaultBrowserType: _ignored, ...options } = GALAXY_S23; add("galaxy-s23", "Galaxy S23 (360x780 custom)", "chromium", options); }
  for (const w of PLAIN_WIDTHS) {
    const mobile = w <= 600;
    add(`w${w}`, `Chromium ${w}px`, "chromium", { viewport: { width: w, height: heightFor(w) }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: true, ...(mobile ? { userAgent: ANDROID_UA } : {}) });
  }
  for (const [w, h] of LANDSCAPES) add(`land${w}x${h}`, `Chromium landscape ${w}x${h}`, "chromium", { viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
  let list = out;
  if (quick) list = out.filter((d) => QUICK_DEVICES.includes(d.id));
  if (only?.length) list = out.filter((d) => only.includes(d.id));
  return list;
}
export const QUICK_DEVICES = ["iphone-se", "w320", "pixel-7"];

// ------------------------------------------------------------------------------------------------ pages
/** Public pages: [name, path]. */
export const PUBLIC_PAGES = [
  ["home", "/"], ["preise", "/preise"], ["schulen", "/schulen"], ["familien", "/familien"], ["pilot", "/pilot"], ["kontakt", "/kontakt"],
  ["hilfe", "/hilfe"], ["anleitung", "/anleitung"], ["impressum", "/impressum"], ["datenschutz", "/datenschutz"], ["datenschutz-jugend", "/datenschutz-jugend"],
  ["datenschutz-schulen", "/datenschutz-schulen"], ["datenschutz-uebersicht", "/datenschutz-uebersicht"], ["avv", "/avv"], ["hosting", "/hosting"],
  ["loeschkonzept", "/loeschkonzept"], ["schullizenz", "/schullizenz"], ["bewerbung-check", "/bewerbung-check"], ["login", "/login"], ["login-reset", "/login/reset"],
  ["class-join-wrong", "/classes/join/FALSCH12"], ["family-invite-wrong", "/familie/einladung/FALSCH12"], ["not-found", "/gibt-es-nicht-404"],
];
/** Per-role app pages. `{appId}`, `{classId}`, `{studentId}` are filled in after the setup. `flow` names a scripted interaction. */
export const ROLE_PAGES = {
  schueler: [
    ["dashboard", "/dashboard"], ["mehr-sheet", "/dashboard", "mehr"], ["search", "/search"], ["applications", "/applications"], ["applications-new", "/applications/new"],
    ["application-detail", "/applications/{appId}"], ["application-edit", "/applications/{appId}", "edit"], ["application-delete-dialog", "/applications/{appId}", "delete-dialog"],
    ["map", "/map"], ["map-search-panel", "/map", "map-search"], ["map-shop-sheet", "/map", "map-shop"], ["map-placement", "/map", "map-placement"],
    ["cvs", "/cvs"], ["analytics", "/analytics"], ["friends", "/friends"], ["classes", "/classes"], ["class-detail", "/classes/{classId}"],
    ["familie", "/familie"], ["profile", "/profile"], ["settings", "/settings"], ["abo", "/abo"],
  ],
  eltern: [["familie", "/familie"], ["mehr-sheet", "/familie", "mehr"], ["abo", "/abo"], ["settings", "/settings"], ["profile", "/profile"]],
  lehrperson: [["teacher", "/teacher"], ["mehr-sheet", "/teacher", "mehr"], ["teacher-class", "/teacher/classes/{classId}"], ["teacher-student", "/teacher/classes/{classId}/students/{studentId}"], ["settings", "/settings"], ["profile", "/profile"]],
  schule: [["schul-admin", "/schul-admin"], ["mehr-sheet", "/schul-admin", "mehr"], ["schullizenz", "/schullizenz"], ["settings", "/settings"]],
};
export const QUICK_PAGES = {
  public: ["home", "preise", "login"],
  schueler: ["dashboard", "mehr-sheet", "applications", "application-detail", "map", "map-shop-sheet", "map-placement"],
  eltern: ["familie"], lehrperson: ["teacher", "teacher-class"], schule: ["schul-admin"],
};
/** Text-scaling subset: [role, page name]. */
export const SCALE_PAGES = [["public", "home"], ["public", "preise"], ["schueler", "dashboard"], ["schueler", "applications"], ["lehrperson", "teacher-class"]];
export const SCALE_LEVELS = [130, 200];
export const SCALE_DEVICES = ["iphone-13", "w360"];
/** Throttled subset (Chromium only). */
export const THROTTLE_PAGES = [["public", "home"], ["schueler", "dashboard"], ["schueler", "map"]];
export const SLOW_4G = { offline: false, latency: 150, downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8), uploadThroughput: Math.round((750 * 1024) / 8) };
export const fillPath = (path, vars) => path.replace(/\{(\w+)\}/g, (_, k) => (vars?.[k] != null ? encodeURIComponent(vars[k]) : `{${k}}`));
export const parseList = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : null);

// ------------------------------------------------------------------------------------------------ ownership
const PUBLIC_RE = /^\/($|preise|schulen|familien|pilot|kontakt|hilfe|anleitung|impressum|datenschutz|avv|hosting|loeschkonzept|schullizenz|bewerbung-check|gibt-es-nicht)/;
/** Owner from the brief's ownership list. Shell-level selectors (nav, header, app bars, viewport) always go to SHELL. */
export function ownerFor(role, path, selector = "") {
  if (/app-bar|Hauptmenü|^viewport|bottom-nav|nextjs/i.test(selector)) return role === "public" ? "PUBLIC" : "SHELL";
  if (/^\/map|^\/friends\/[^/]+/.test(path) || /class-village|map-shop|island|placement|MapSheet|map_/i.test(selector)) return "VILLAGE";
  if (role === "public" || PUBLIC_RE.test(path)) return path.startsWith("/login") || path.startsWith("/classes/join") || path.startsWith("/familie/einladung") ? "SHELL" : "PUBLIC";
  if (/^\/(familie|teacher|classes|schul-admin|admin)/.test(path)) return "ROLES";
  return "SHELL";
}

// ------------------------------------------------------------------------------------------------ severity
/** Issue kinds that make the gate fail. */
export const ERROR_KINDS = new Set(["overflow", "overlap", "offscreen-control", "dialog-offscreen", "target-primary", "input-font", "viewport-meta", "nav-gap", "content-under-nav"]);
export const severityOf = (issue) => (ERROR_KINDS.has(issue.kind) ? "error" : "warn");
/** Tap target classification from size + context (pure, unit-tested). */
export function classifyTarget({ w, h, inNav = false, primary = false, inlineText = false }) {
  if (inlineText) return null;
  const min = Math.min(w, h);
  if (min >= 44) return null;
  if ((inNav || primary) && min < 40) return "target-primary";
  return "target-small";
}
/** Keyword-based input type hints (pure, unit-tested). Returns an issue message or null. */
export function inputTypeHint({ type = "text", inputmode = "", hint = "" }) {
  const t = String(type).toLowerCase(), im = String(inputmode).toLowerCase(), h = String(hint).toLowerCase();
  if (/e-?mail/.test(h) && t !== "email" && im !== "email") return "looks like an e-mail field but type is not email";
  if (/telefon|phone|handy|natel|\btel\b|mobile?nummer/.test(h) && t !== "tel" && im !== "tel") return "looks like a phone field but type is not tel";
  if (/\bplz\b|postleitzahl|jahrgang|geburtsjahr|anzahl/.test(h) && t !== "number" && !["numeric", "decimal"].includes(im)) return "numeric field without type=number / inputmode=numeric";
  return null;
}
export const viewportMetaIssue = (content) => {
  if (content == null) return "no <meta name=viewport>";
  if (/user-scalable\s*=\s*(no|0)/i.test(content)) return "user-scalable=no blocks zoom";
  if (/maximum-scale/i.test(content)) return "maximum-scale limits zoom";
  if (!/width\s*=\s*device-width/i.test(content)) return "missing width=device-width";
  return null;
};

// ------------------------------------------------------------------------------------------------ in-page audit (serialised)
/**
 * Runs inside the page. opts: { mobile, maxOverlap }; h: the pure helpers above (see auditExpression). Returns { metrics, issues[] }.
 * Each issue: { kind, sel, msg, w?, h? }.
 */
export function auditPage(opts, h) {
  const issues = [];
  const W = window.innerWidth, H = window.innerHeight;
  const cs = (el) => getComputedStyle(el);
  const selOf = (el) => {
    if (!el || el.nodeType !== 1) return "?";
    const parts = [];
    let cur = el;
    for (let i = 0; cur && cur.nodeType === 1 && i < 3; i++, cur = cur.parentElement) {
      let s = cur.tagName.toLowerCase();
      if (cur.id && !/^(«|:r|radix)/.test(cur.id)) s += "#" + cur.id;
      const tid = cur.getAttribute("data-testid"); if (tid) s += `[data-testid=${tid}]`;
      const al = cur.getAttribute("aria-label"); if (al && i === 0) s += `[aria-label="${al.slice(0, 40)}"]`;
      const cls = typeof cur.className === "string" ? cur.className.split(/\s+/).filter((c) => c && !/^(hover:|focus|active:|group|transition|duration)/.test(c)).slice(0, 3) : [];
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
      if (cur.id || tid) break;
    }
    return parts.join(" > ").slice(0, 220);
  };
  const textOf = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 50);
  const hiddenByAncestor = (el) => { for (let a = el; a; a = a.parentElement) { if (a.hasAttribute?.("inert") || a.getAttribute?.("aria-hidden") === "true") return true; const s = cs(a); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true; } return false; };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = cs(el); if (s.visibility === "hidden" || s.display === "none" || s.pointerEvents === "none") return false; if (el.closest(".sr-only")) return false; return !hiddenByAncestor(el); };
  const fixedAncestor = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const p = cs(a).position; if (p === "fixed" || p === "sticky") return a; } return null; };
  for (const p of document.querySelectorAll("nextjs-portal")) p.remove(); // dev badge / overlay: ignore

  // (f) viewport meta
  const vm = document.querySelector('meta[name="viewport"]');
  const vmIssue = h.viewportMetaIssue(vm ? vm.getAttribute("content") : null);
  if (vmIssue) issues.push({ kind: "viewport-meta", sel: "viewport", msg: `${vmIssue} (${vm ? vm.getAttribute("content") : "-"})` });

  // (a) horizontal overflow
  const se = document.scrollingElement || document.documentElement;
  const scrollW = se.scrollWidth;
  const overflowX = scrollW > W + 1;
  const scrollsX = (a) => { const o = cs(a).overflowX; return o === "auto" || o === "scroll" || o === "hidden" || o === "clip"; };
  const offenders = [];
  const all = document.body ? document.body.querySelectorAll("*") : [];
  for (const el of all) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const right = r.right + window.scrollX, left = r.left + window.scrollX;
    if (right <= W + 1 && left >= -1) continue;
    const s = cs(el); if (s.position === "fixed" || s.visibility === "hidden" || s.display === "none") continue;
    if (el.closest(".sr-only")) continue;
    let contained = false, isFixed = false;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) { if (cs(a).position === "fixed") { isFixed = true; break; } if (scrollsX(a)) { contained = true; break; } }
    if (contained || isFixed) continue;
    // keep only the outermost offender of a chain
    if (el.parentElement && offenders.some((o) => o.el.contains(el))) continue;
    offenders.push({ el, right: Math.round(right), left: Math.round(left), w: Math.round(r.width) });
  }
  if (overflowX) issues.push({ kind: "overflow", sel: offenders[0] ? selOf(offenders[0].el) : "document", msg: `page scrolls horizontally: scrollWidth ${scrollW} > ${W}; offenders: ${offenders.slice(0, 4).map((o) => `${selOf(o.el)} (${o.left}..${o.right}px)`).join(" ; ") || "none found"}` });
  else for (const o of offenders.slice(0, 3)) issues.push({ kind: "offscreen-clipped", sel: selOf(o.el), msg: `element extends past the viewport (${o.left}..${o.right}px of ${W}) but the page clips it (overflow hidden on html/body?)` });

  // collect interactive elements
  const modal = [...document.querySelectorAll('[role=dialog][aria-modal=true], [role=alertdialog], dialog[open]')].filter(visible).pop() || null;
  const nav = [...document.querySelectorAll('nav[aria-label="Hauptmenü mobil"], .app-bar-bottom')].find((n) => visible(n) && cs(n).position === "fixed") || null;
  const ia = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary')].filter((el) => visible(el) && !el.disabled && (!modal || modal.contains(el)));

  // (c) tap targets
  let smallCount = 0; const smallSamples = [];
  for (const el of ia) {
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase();
    let w = r.width, hh = r.height;
    if (tag === "input" && (type === "checkbox" || type === "radio")) { const lab = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)); if (lab) { const lr = lab.getBoundingClientRect(); w = Math.max(w, lr.width); hh = Math.max(hh, lr.height); } }
    const inlineText = tag === "a" && cs(el).display === "inline" && !!el.closest("p, li, dd, td, label, small, span, figcaption, blockquote");
    const inNav = !!el.closest("nav, header, .app-bar, [role=navigation], [role=tablist]");
    const primary = (tag === "button" && type === "submit") || /\b(btn-primary|btn-sun|bg-\[var\(--sun\)\]|button-primary)\b/.test(typeof el.className === "string" ? el.className : "") || el.getAttribute("data-variant") === "primary";
    const kind = h.classifyTarget({ w, h: hh, inNav, primary, inlineText });
    if (!kind) continue;
    if (kind === "target-primary") issues.push({ kind, sel: selOf(el), msg: `${inNav ? "nav" : "primary"} target ${Math.round(w)}x${Math.round(hh)} < 40px: "${textOf(el)}"`, w: Math.round(w), h: Math.round(hh) });
    else { smallCount++; if (smallSamples.length < 6) smallSamples.push(`${selOf(el).split(" > ").pop()} "${textOf(el)}" ${Math.round(w)}x${Math.round(hh)}`); }
  }
  if (smallCount) issues.push({ kind: "target-small", sel: "(several)", msg: `${smallCount} tap targets < 44px, e.g. ${smallSamples.join(" | ")}`, count: smallCount });

  // (d) inputs
  if (opts.mobile) for (const el of ia) {
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "text").toLowerCase();
    if (!["input", "textarea", "select"].includes(tag) || ["checkbox", "radio", "range", "color", "file", "submit", "button", "image", "reset"].includes(type)) continue;
    const fs = parseFloat(cs(el).fontSize);
    if (fs < 16) issues.push({ kind: "input-font", sel: selOf(el), msg: `${tag}[${type}] font-size ${fs}px < 16px (iOS zooms on focus)` });
  }
  for (const el of ia) {
    const tag = el.tagName.toLowerCase(); if (tag !== "input") continue;
    const type = (el.getAttribute("type") || "text").toLowerCase(); if (["checkbox", "radio", "range", "color", "file", "submit", "button", "image", "reset", "hidden", "search", "password", "date"].includes(type)) continue;
    const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
    const hint = [el.name, el.id, el.getAttribute("autocomplete"), el.getAttribute("placeholder"), el.getAttribute("aria-label"), lab?.innerText].filter(Boolean).join(" ").toLowerCase();
    const msg = h.inputTypeHint({ type, inputmode: el.getAttribute("inputmode") || "", hint });
    if (msg) issues.push({ kind: "input-type", sel: selOf(el), msg });
  }

  // (e) clipped text
  let clipN = 0;
  for (const el of all) {
    if (clipN >= 8) break;
    if (!el.firstChild || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const s = cs(el);
    if (!(s.overflowX === "hidden" || s.overflowX === "clip" || s.overflow === "hidden")) continue;
    if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none")) continue;
    if (el.closest(".sr-only") || !visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) { clipN++; issues.push({ kind: "text-clipped", sel: selOf(el), msg: `text cut off without ellipsis (${el.scrollWidth}>${el.clientWidth}px): "${textOf(el)}"` }); }
    else if (el.clientHeight > 0 && el.clientHeight < 90 && el.scrollHeight > el.clientHeight + 2 && (s.overflowY === "hidden" || s.overflowY === "clip")) { clipN++; issues.push({ kind: "text-clipped", sel: selOf(el), msg: `text cut off vertically (${el.scrollHeight}>${el.clientHeight}px): "${textOf(el)}"` }); }
  }

  // open dialogs / sheets must fit the viewport
  for (const d of [...document.querySelectorAll('[role=dialog], dialog[open], [role=alertdialog]')].filter(visible)) {
    const r = d.getBoundingClientRect();
    if (r.bottom > H + 2 || r.top < -2 || r.right > W + 2) issues.push({ kind: "dialog-offscreen", sel: selOf(d), msg: `dialog/sheet ${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)} exceeds viewport ${W}x${H}` });
  }

  // (b) overlap: interactive element centre covered by a fixed/sticky bar, or a control in a fixed layer cut off by the viewport
  const sx = window.scrollX, sy = window.scrollY;
  let overlapN = 0, offN = 0;
  const maxCheck = opts.maxOverlap || 220;
  for (const el of ia.slice(0, maxCheck)) {
    if (overlapN >= 10) break;
    const fa = fixedAncestor(el);
    if (!fa) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy > H - 1 || cy < 1 || cx > W - 1 || cx < 1) {
      // in a fixed/sticky layer that cannot scroll it into view: unreachable control
      if (fa && offN < 6) {
        let sc = false; for (let a = el.parentElement; a && a !== fa.parentElement; a = a.parentElement) { const o = cs(a).overflowY; if ((o === "auto" || o === "scroll") && a.scrollHeight > a.clientHeight) { sc = true; break; } }
        if (!sc) { offN++; issues.push({ kind: "offscreen-control", sel: selOf(el), msg: `"${textOf(el)}" centre at ${Math.round(cx)},${Math.round(cy)} is outside the ${W}x${H} viewport and its layer (${selOf(fa).split(" > ").pop()}) does not scroll` }); }
      }
      continue;
    }
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
    const label = hit.closest("label"); if (label && (label.contains(el) || (el.id && label.htmlFor === el.id))) continue;
    const bar = fixedAncestor(hit);
    if (!bar || bar.contains(el)) continue;
    overlapN++;
    issues.push({ kind: "overlap", sel: selOf(el), msg: `"${textOf(el)}" (${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(cx)},${Math.round(cy)}) is covered by ${selOf(bar).split(" > ").pop()}${nav && nav.contains(hit) ? " (bottom nav)" : ""}` });
  }
  window.scrollTo(sx, sy);

  // (g) bottom nav flush + no empty strip + page end clears the nav
  const metrics = { W, H, scrollW, overflowX, interactive: ia.length, modal: !!modal, nav: null };
  if (nav) {
    const nr = nav.getBoundingClientRect();
    const inner = nav.querySelector("ul") || nav.firstElementChild;
    const ir = inner ? inner.getBoundingClientRect() : nr;
    const pb = parseFloat(cs(nav).paddingBottom) || 0;
    const strip = Math.round(nr.bottom - ir.bottom);
    metrics.nav = { top: Math.round(nr.top), bottom: Math.round(nr.bottom), height: Math.round(nr.height), strip, paddingBottom: pb };
    if (Math.abs(nr.bottom - H) > 1) issues.push({ kind: "nav-gap", sel: selOf(nav), msg: `bottom nav bottom ${Math.round(nr.bottom)} != innerHeight ${H} (gap ${Math.round(H - nr.bottom)}px)` });
    if (strip > pb + 2) issues.push({ kind: "nav-strip", sel: selOf(nav), msg: `empty strip of ${strip}px under the nav items (safe-area padding ${pb}px)` });
    if (!modal) {
      // page end: the last visible content inside <main> must end above the nav when scrolled to the bottom
      const main = document.querySelector("main");
      if (main && cs(main).position !== "fixed") {
        window.scrollTo(0, se.scrollHeight);
        const nTop = nav.getBoundingClientRect().top;
        let lowest = null, lb = -1;
        for (const el of main.querySelectorAll("a, button, input, select, textarea, p, h1, h2, h3, li, img")) { if (!visible(el) || fixedAncestor(el)) continue; const r = el.getBoundingClientRect(); if (r.bottom > lb) { lb = r.bottom; lowest = el; } }
        if (lowest && lb > nTop + 2 && se.scrollHeight > H) issues.push({ kind: "content-under-nav", sel: selOf(lowest), msg: `at page end "${textOf(lowest)}" ends at ${Math.round(lb)}px, below the nav top ${Math.round(nTop)}px (missing bottom padding)` });
        window.scrollTo(sx, sy);
      }
    }
  }
  return { metrics, issues };
}

/** JS expression string that runs auditPage with the pure helpers inlined (string evaluation is not subject to the page CSP). */
export const auditExpression = (opts) => `(${auditPage})(${JSON.stringify(opts)}, { classifyTarget: ${classifyTarget}, inputTypeHint: ${inputTypeHint}, viewportMetaIssue: ${viewportMetaIssue} })`;

/** Runs inside the page: cumulative layout shift so far (needs the init script that installs the observer). */
export function readCls() { return window.__mobCls || 0; }
export function installClsObserver() {
  window.__mobCls = 0;
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__mobCls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch { /* webkit: unsupported */ }
}

// ------------------------------------------------------------------------------------------------ aggregation + report
export const issueKey = (role, page, i) => `${role}|${page}|${i.kind}|${i.sel}|${i.kind === "target-small" ? "" : i.msg.replace(/\d+(\.\d+)?/g, "#")}`;
/**
 * results: [{ device, role, page, path, mode, issues[], error? }]. Returns aggregated rows (same issue on many devices merged).
 */
export function aggregate(results) {
  const map = new Map();
  for (const r of results) for (const i of r.issues || []) {
    const k = issueKey(r.role, r.page + (r.mode && r.mode !== "base" ? `@${r.mode}` : ""), i);
    if (!map.has(k)) map.set(k, { role: r.role, page: r.page, mode: r.mode || "base", path: r.path, kind: i.kind, severity: severityOf(i), sel: i.sel, msg: i.msg, devices: [], owner: ownerFor(r.role, r.path, i.sel) });
    const row = map.get(k); if (!row.devices.includes(r.device)) row.devices.push(r.device);
  }
  return [...map.values()].sort((a, b) => (a.severity === b.severity ? b.devices.length - a.devices.length : a.severity === "error" ? -1 : 1));
}
export function countBy(rows, f) { const o = {}; for (const r of rows) { const k = f(r); o[k] = (o[k] || 0) + 1; } return o; }
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
export function markdownReport({ title, base, started, finished, devices, results, aggregated, extra = "" }) {
  const errs = aggregated.filter((r) => r.severity === "error"), warns = aggregated.filter((r) => r.severity === "warn");
  const perPage = {};
  for (const r of results) { const k = `${r.role} ${r.page}${r.mode && r.mode !== "base" ? "@" + r.mode : ""}`; perPage[k] ??= { e: 0, w: 0, devices: new Set() }; for (const i of r.issues || []) { if (severityOf(i) === "error") { perPage[k].e++; perPage[k].devices.add(r.device); } else perPage[k].w++; } }
  const worst = Object.entries(perPage).filter(([, v]) => v.e).sort((a, b) => b[1].e - a[1].e).slice(0, 25);
  const L = [];
  L.push(`# ${title}`, "", `Base: ${base} · started ${started} · finished ${finished}`, `Devices (${devices.length}): ${devices.map((d) => d.id).join(", ")}`, `Page audits: ${results.length} (${results.filter((r) => r.error).length} navigation errors)`, "");
  L.push(`**Distinct issues: ${errs.length} errors, ${warns.length} warnings** (an issue = same page + check + element, merged across devices).`, "");
  L.push("| kind | errors (distinct) | page×device hits |", "|---|---|---|");
  const hits = {}; for (const r of results) for (const i of r.issues || []) hits[i.kind] = (hits[i.kind] || 0) + 1;
  const kinds = countBy(aggregated, (r) => r.kind);
  for (const k of Object.keys(kinds).sort((a, b) => (hits[b] || 0) - (hits[a] || 0))) L.push(`| ${k}${ERROR_KINDS.has(k) ? " (error)" : " (warn)"} | ${kinds[k]} | ${hits[k] || 0} |`);
  L.push("", "## Worst offenders (page, error hits across devices)", "", "| page | error hits | warn hits | devices with errors |", "|---|---|---|---|");
  for (const [k, v] of worst) L.push(`| ${k} | ${v.e} | ${v.w} | ${[...v.devices].join(", ")} |`);
  const owners = ["VILLAGE", "SHELL", "ROLES", "PUBLIC"];
  for (const o of owners) {
    const rows = aggregated.filter((r) => r.owner === o);
    if (!rows.length) continue;
    L.push("", `## Owner ${o} — ${rows.filter((r) => r.severity === "error").length} errors, ${rows.filter((r) => r.severity === "warn").length} warnings`, "");
    const pages = [...new Set(rows.map((r) => `${r.role} ${r.page}${r.mode !== "base" ? "@" + r.mode : ""}`))];
    for (const pg of pages) {
      const pr = rows.filter((r) => `${r.role} ${r.page}${r.mode !== "base" ? "@" + r.mode : ""}` === pg);
      L.push(`### ${pg} (${pr[0].path})`, "", "| sev | check | element | what | devices |", "|---|---|---|---|---|");
      for (const r of pr.slice(0, 30)) L.push(`| ${r.severity === "error" ? "**ERR**" : "warn"} | ${r.kind} | \`${esc(r.sel)}\` | ${esc(r.msg).slice(0, 400)} | ${r.devices.length > 6 ? r.devices.length + " devices: " + r.devices.slice(0, 6).join(", ") + " …" : r.devices.join(", ")} |`);
      if (pr.length > 30) L.push(`| | | | … ${pr.length - 30} more (see JSON) | |`);
      L.push("");
    }
  }
  if (extra) L.push("", extra);
  return L.join("\n");
}
