export type Platform = "ios" | "android" | "mac" | "windows";

/** Best guess of the visitor's device from the user agent. iPadOS reports "Macintosh", so touch points tell it apart from a Mac. */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform | null {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  if (/windows/i.test(ua)) return "windows";
  return null;
}
