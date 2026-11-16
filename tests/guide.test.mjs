import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { detectPlatform } from "../components/guide/platform.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("detectPlatform recognises the four install targets", () => {
  assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"), "ios");
  assert.equal(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 5), "ios", "iPadOS poses as a Mac but has touch points");
  assert.equal(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", 0), "mac");
  assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36"), "android");
  assert.equal(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0"), "windows");
  assert.equal(detectPlatform("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/133.0"), null);
});

test("/anleitung has canonical, OpenGraph and FAQ JSON-LD", () => {
  const page = read("app/anleitung/page.tsx");
  assert.match(page, /const url = "https:\/\/wendapply\.ch\/anleitung"/);
  assert.match(page, /canonical: url/);
  assert.match(page, /openGraph:/);
  assert.match(page, /"FAQPage"/);
  assert.match(page, /replace\(\/<\/g/, "JSON-LD is escaped against </script> injection");
});

test("install section covers iPhone/iPad, Android, Mac and Windows with an install anchor", () => {
  const install = read("components/guide/install-section.tsx");
  for (const id of ["install-ios", "install-android", "install-mac", "install-windows"]) assert.ok(install.includes(`"${id}"`), id);
  assert.match(install, /Zum Home-Bildschirm/);
  assert.match(install, /Zum Dock hinzufügen/);
  assert.match(read("app/anleitung/page.tsx"), /id="installieren"/);
});

test("landing page and Hilfe link to the guide", () => {
  assert.match(read("app/page.tsx"), /href="\/anleitung"/);
  assert.match(read("app/hilfe/page.tsx"), /href="\/anleitung"/);
});

test("guide images referenced by the page exist", () => {
  const src = read("components/guide/content.tsx") + read("app/anleitung/page.tsx");
  const refs = [...src.matchAll(/"\/(guide|landing)\/([\w-]+\.webp)"/g)].map((m) => `public/${m[1]}/${m[2]}`);
  assert.ok(refs.length > 0);
  for (const r of refs) assert.ok(existsSync(new URL(`../${r}`, import.meta.url)), r);
});
