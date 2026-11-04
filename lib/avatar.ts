// Pure helpers for profile pictures (no browser or Supabase imports, so they run in node tests).

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const AVATAR_ACCEPT = AVATAR_TYPES.join(",");
export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 4;

export type AvatarValidation = { ok: true } | { ok: false; message: string };

/** Checks type and size of a picked file before it is even decoded. */
export function validateAvatarFile(file: { type: string; size: number }): AvatarValidation {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: "Dieses Format wird nicht unterstützt. Bitte wähle ein PNG-, JPEG- oder WebP-Bild." };
  if (file.size <= 0) return { ok: false, message: "Diese Datei ist leer. Bitte wähle ein anderes Bild." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, message: "Das Bild ist größer als 5 MB. Bitte wähle ein kleineres Bild." };
  return { ok: true };
}

export function avatarExtension(mime: string) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp"; }
export function avatarPath(userId: string, mime: string) { return `${userId}/avatar.${avatarExtension(mime)}`; }
/** Cache busting: the same path is reused, so every save gets a new `v` query. */
export function withVersion(url: string, version: number | string) { return `${url.split("?")[0]}?v=${version}`; }
/** Extracts the storage path (`<user>/avatar.<ext>`) from a public avatar URL. */
export function pathFromAvatarUrl(url: string) { const match = /\/avatars\/([^?#]+)/.exec(url); return match ? decodeURIComponent(match[1]) : undefined; }

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

export function clampZoom(zoom: number) { return Math.min(AVATAR_MAX_ZOOM, Math.max(AVATAR_MIN_ZOOM, Number.isFinite(zoom) ? zoom : 1)); }
/** Pixels per source pixel so the shorter image side exactly fills the square viewport at zoom 1. */
export function baseScale(image: Size, viewport: number) { return viewport / Math.min(image.width, image.height); }

/** Keeps the image covering the whole viewport. `offset` is the shift of the image centre from the viewport centre. */
export function clampOffset(offset: Point, image: Size, viewport: number, zoom: number): Point {
  const scale = baseScale(image, viewport) * clampZoom(zoom);
  const maxX = Math.max(0, (image.width * scale - viewport) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

/** The visible square in source-image pixels, used for drawImage when exporting. */
export function sourceRect(image: Size, viewport: number, zoom: number, offset: Point) {
  const scale = baseScale(image, viewport) * clampZoom(zoom);
  const clamped = clampOffset(offset, image, viewport, zoom);
  const side = viewport / scale;
  return { sx: image.width / 2 - clamped.x / scale - side / 2, sy: image.height / 2 - clamped.y / scale - side / 2, side };
}

/** Output edge: never upscale, at most AVATAR_OUTPUT_SIZE. */
export function outputSize(side: number) { return Math.max(1, Math.min(AVATAR_OUTPUT_SIZE, Math.round(side))); }
