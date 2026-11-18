"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INSTALL_DISMISS_KEY, installMode, isIosSafari } from "./install-logic";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function readDismissed() { try { return localStorage.getItem(INSTALL_DISMISS_KEY) === "1"; } catch { return false; } }
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Small dismissible "App installieren" banner. Mounted once in app/layout.tsx so `beforeinstallprompt`
 * is captured on any page, but it only shows on /dashboard. iOS Safari gets a "Teilen → Zum Home-Bildschirm" hint.
 * Sits above the mobile tab bar (same offset as the toasts) and in the bottom-right corner on desktop.
 */
export function InstallHint() {
  const path = usePathname() ?? "/";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [env, setEnv] = useState<{ standalone: boolean; dismissed: boolean; iosSafari: boolean } | null>(null);

  useEffect(() => {
    // client-only facts (localStorage, matchMedia, UA): read after mount to keep hydration stable
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({ standalone: isStandalone(), dismissed: readDismissed(), iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints) });
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setDeferred(null); setEnv((s) => (s ? { ...s, standalone: true } : s)); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!env) return null;
  const mode = installMode({ path, standalone: env.standalone, dismissed: env.dismissed, hasPrompt: !!deferred, iosSafari: env.iosSafari });
  if (!mode) return null;

  const dismiss = () => {
    try { localStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch { /* private mode */ }
    setEnv({ ...env, dismissed: true });
  };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    if (choice?.outcome === "dismissed") dismiss();
  };

  return (
    <aside aria-label="App installieren" data-testid="install-hint" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-clearance)+12px)] z-40 flex justify-center px-3 md:inset-x-auto md:bottom-6 md:right-6 md:px-0">
      <div className="pointer-events-auto animate-rise flex w-full max-w-md items-center gap-3 rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] py-1.5 pl-4 pr-1.5 text-[var(--ink)] shadow-[var(--shadow-md)]">
        {mode === "prompt" ? (
          <>
            <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">WendApply als App</span><span className="block text-[var(--muted)]">Direkt vom Startbildschirm öffnen.</span></p>
            <Button type="button" size="sm" onClick={install} icon={<Download aria-hidden size={16} />} className="shrink-0 gap-1.5 rounded-full font-semibold">App installieren</Button>
          </>
        ) : (
          <p className="min-w-0 flex-1 py-1.5 text-sm">
            <span className="font-semibold">WendApply als App:</span>{" "}
            Tippe auf <Share aria-label="Teilen" size={15} className="inline align-[-2px]" /> <span className="font-semibold">Teilen</span> → <span className="font-semibold">Zum Home-Bildschirm</span>.
          </p>
        )}
        <button type="button" onClick={dismiss} aria-label="Hinweis ausblenden" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--hover)]"><X size={16} aria-hidden /></button>
      </div>
    </aside>
  );
}
