// Links built from user-entered or third-party data (job URLs, websites) may only be http(s).
// Blocks javascript:, data:, vbscript: and friends even if a value slipped past the form (old rows, imports, API writes).
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > 2048) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
