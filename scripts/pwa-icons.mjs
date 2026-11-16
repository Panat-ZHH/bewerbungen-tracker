// Generates PWA icons from app/icon.png (run: node scripts/pwa-icons.mjs). Requires sharp (dependency of next).
import sharp from "sharp";
const src = "app/icon.png";
const out = "public/icons";
const white = { r: 255, g: 255, b: 255, alpha: 1 };
// "any" icons: the source already has generous padding on white.
for (const size of [16, 32, 48, 192, 512]) await sharp(src).resize(size, size).png().toFile(`${out}/icon-${size}.png`);
// apple-touch-icon: iOS rounds corners itself, opaque background required.
await sharp(src).resize(180, 180).flatten({ background: white }).png().toFile(`${out}/apple-touch-icon.png`);
// maskable: logo shrunk to 76% so it stays inside the 80% safe-zone circle.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.76);
  const logo = await sharp(src).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: white } }).composite([{ input: logo, gravity: "center" }]).png().toFile(`${out}/maskable-${size}.png`);
}
// favicon.ico (16/32/48) for clients that request /favicon.ico directly: `magick public/icons/icon-{16,32,48}.png public/favicon.ico`.
// Manifest screenshots (narrow = public/icons/screenshot-narrow.webp, wide = public/landing/04-dashboard-light.webp) come from
// scripts/marketing-shots.mjs (real mobile capture with demo data), no longer from a crop here.
console.log("icons written to", out);
