import { ChevronDown, Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import type { ReactNode } from "react";
import { PlatformOpen } from "./platform-open";

type Os = { id: string; icon: typeof Smartphone; title: string; browser: string; steps: ReactNode[]; note?: ReactNode };

const k = (s: string) => <strong className="font-semibold text-[var(--ink)]">{s}</strong>;

const systems: Os[] = [
  {
    id: "install-ios", icon: Tablet, title: "iPhone und iPad", browser: "Safari",
    steps: [
      <>Öffne <span className="whitespace-nowrap">wendapply.ch</span> in {k("Safari")}.</>,
      <>Tippe unten (iPad: oben rechts) auf {k("Teilen")}, das Quadrat mit dem Pfeil nach oben.</>,
      <>Scrolle in der Liste nach unten und wähle {k("Zum Home-Bildschirm")}.</>,
      <>Lass den Namen «WendApply» stehen und tippe auf {k("Hinzufügen")}.</>,
    ],
    note: <>Seit iOS 16.4 klappt das auch in Chrome und Edge über das Teilen-Menü. Benachrichtigungen (Push) funktionieren auf dem iPhone nur, wenn du WendApply so installiert hast.</>,
  },
  {
    id: "install-android", icon: Smartphone, title: "Android", browser: "Chrome",
    steps: [
      <>Öffne <span className="whitespace-nowrap">wendapply.ch</span> in {k("Chrome")}.</>,
      <>Tippe auf den Hinweis {k("Installieren")} oder {k("App installieren")}, falls er unten erscheint.</>,
      <>Sonst: oben rechts auf das {k("Menü (⋮)")} tippen und {k("App installieren")} oder {k("Zum Startbildschirm hinzufügen")} wählen.</>,
      <>Bestätige mit {k("Installieren")}. WendApply erscheint bei deinen Apps.</>,
    ],
    note: <>In Samsung Internet heisst es {k("Menü → Seite hinzufügen zu → Startbildschirm")}.</>,
  },
  {
    id: "install-mac", icon: Laptop, title: "Mac", browser: "Chrome, Edge oder Safari",
    steps: [
      <>{k("Chrome / Edge:")} Öffne wendapply.ch und klicke rechts in der Adresszeile auf das {k("Installieren-Symbol")} (Bildschirm mit Pfeil).</>,
      <>Kein Symbol zu sehen? Im Menü {k("⋮ → Streamen, speichern und teilen → Seite als App installieren")} (Edge: {k("… → Apps → Diese Website als App installieren")}).</>,
      <>{k("Safari 17 oder neuer:")} In der Menüleiste {k("Ablage → Zum Dock hinzufügen")} wählen.</>,
      <>WendApply startet danach wie eine normale App aus dem Dock oder dem Launchpad.</>,
    ],
  },
  {
    id: "install-windows", icon: Monitor, title: "Windows", browser: "Edge oder Chrome",
    steps: [
      <>Öffne wendapply.ch in {k("Microsoft Edge")} oder {k("Chrome")}.</>,
      <>Klicke rechts in der Adresszeile auf das {k("Installieren-Symbol")} (App verfügbar).</>,
      <>Oder im Menü: Edge {k("… → Apps → Diese Website als App installieren")}, Chrome {k("⋮ → Streamen, speichern und teilen → Seite als App installieren")}.</>,
      <>Bestätige mit {k("Installieren")}. Du findest WendApply danach im Startmenü und kannst es an die Taskleiste anheften.</>,
    ],
  },
];

/** Install instructions as exclusive accordions (native <details name>, works without JS). A tiny client helper opens the visitor's platform. */
export function InstallSection() {
  return (
    <div className="space-y-3">
      <PlatformOpen />
      {systems.map(({ id, icon: Icon, title, browser, steps, note }) => (
        <details key={id} id={id} name="install-os" className="group panel-flat overflow-hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none hover:bg-[var(--surface-2)] group-open:bg-[var(--surface-2)] sm:px-5 [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]"><Icon size={20} strokeWidth={2.2} /></span>
            <span className="min-w-0 flex-1">
              <span className="font-display block text-lg font-bold leading-tight tracking-[-.02em]">{title}</span>
              <span className="text-small block text-muted">{browser}</span>
            </span>
            <span data-yours hidden className="sticker sticker-mint shrink-0 text-xs">Dein Gerät</span>
            <ChevronDown size={20} strokeWidth={2.4} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t-[length:var(--border-w)] border-[var(--outline)] px-4 pb-5 pt-4 sm:px-5">
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                  <span aria-hidden className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-sm font-extrabold text-[var(--paper)]">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            {note && <p className="text-small mt-4 rounded-[var(--radius-lg)] bg-[var(--surface-2)] px-3.5 py-2.5 text-muted">{note}</p>}
          </div>
        </details>
      ))}
    </div>
  );
}
