"use client";
import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { pwaEnabled, registerServiceWorker } from "./sw-registration";

const UPDATE_MESSAGE = "Update verfügbar – neu laden";

/** Registers /sw.js and offers a controlled update ("Update verfügbar") when a new worker is waiting. Renders nothing. */
export function PwaRegister() {
  useEffect(() => {
    if (!pwaEnabled() || !("serviceWorker" in navigator)) return;
    let reloading = false;
    let offered = false;
    let userAccepted = false;

    const offerUpdate = (worker: ServiceWorker) => {
      if (offered) return;
      offered = true;
      toast({
        message: UPDATE_MESSAGE,
        tone: "info",
        duration: 10 * 60 * 1000,
        action: { label: "Neu laden", onClick: () => { userAccepted = true; worker.postMessage({ type: "SKIP_WAITING" }); } },
      });
    };
    const onControllerChange = () => {
      if (!userAccepted || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    const watch = (reg: ServiceWorkerRegistration) => {
      registration = reg;
      // a worker that is already waiting (e.g. after a deploy while the app was open in another tab)
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        next?.addEventListener("statechange", () => {
          // only an *update* needs consent; the very first install has no controller yet
          if (next.state === "installed" && navigator.serviceWorker.controller) offerUpdate(next);
        });
      });
    };
    const onVisible = () => { if (document.visibilityState === "visible") registration?.update().catch(() => undefined); };

    const start = () => registerServiceWorker().then((reg) => { if (reg) watch(reg); }).catch(() => undefined);
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("load", start);
    };
  }, []);
  return null;
}
