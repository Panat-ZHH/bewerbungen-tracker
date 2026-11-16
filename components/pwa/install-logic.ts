// Pure helpers for the install hint (unit-tested in tests/pwa-install.test.mjs).
export const INSTALL_DISMISS_KEY = "wendapply-install-dismissed";
/** Paths where the hint may appear. Landing, login and the guide pages stay clean. */
export const INSTALL_HINT_PATHS = ["/dashboard"];

/** iPhone/iPad Safari (incl. iPadOS that reports as Mac with touch). Other iOS browsers can't add to the home screen the same way. */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (!ios) return false;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV/i.test(ua);
}

export type InstallMode = "prompt" | "ios" | null;
export function installMode(o: { path: string; standalone: boolean; dismissed: boolean; hasPrompt: boolean; iosSafari: boolean }): InstallMode {
  if (o.standalone || o.dismissed) return null;
  if (!INSTALL_HINT_PATHS.some((p) => o.path === p || o.path.startsWith(`${p}/`))) return null;
  if (o.hasPrompt) return "prompt";
  if (o.iosSafari) return "ios";
  return null;
}
