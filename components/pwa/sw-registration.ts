// Single place that registers /sw.js, shared by PwaRegister and Web Push (lib/reminders-client.ts),
// so both always use the same registration and options.
export const SW_URL = "/sw.js";
export const SW_SCOPE = "/";

/** True when the app should register its service worker on its own (production, or localhost with NEXT_PUBLIC_PWA_DEV=1). */
export function pwaEnabled(env: string | undefined = process.env.NODE_ENV, devFlag: string | undefined = process.env.NEXT_PUBLIC_PWA_DEV): boolean {
  return env === "production" || devFlag === "1";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  // register() is idempotent for the same URL + scope: it returns the existing registration (and checks for updates)
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" });
}
