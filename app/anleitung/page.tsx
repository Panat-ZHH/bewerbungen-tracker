import type { Metadata } from "next";
import { LoginLink } from "@/components/public/login-link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/lib/seo/site";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { Faq } from "@/components/public/faq";
import { DoodleBurst, DoodlePlane, DoodleSparkle, DoodleTrail } from "@/components/ui/doodles";
import { Toc } from "@/components/guide/toc";
import { InstallSection } from "@/components/guide/install-section";
import { GuideShot } from "@/components/guide/guide-shot";
import { features, guideSteps, faq } from "@/components/guide/content";

export const metadata: Metadata = publicMetadata({ canonical: "/anleitung" });

export default function AnleitungPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/anleitung")} />
      <JsonLd data={faqJsonLd(faq)} />

      <section aria-labelledby="hero-h" className="mx-auto grid w-full max-w-6xl items-center gap-12 overflow-x-clip px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.1fr_.9fr] lg:gap-10">
        <div className="animate-lift">
          <p className="sticker sticker-paper tilt-l mb-5 text-sm">Anleitung</p>
          <h1 id="hero-h" className="text-hero">So funktioniert <span className="marker">WendApply</span>.<DoodleBurst className="ml-2 inline-block h-[.45em] w-[.45em] -translate-y-[.15em] text-[var(--coral)]" /></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">Von der ersten Suche bis zur Zusage: Hier siehst du Schritt für Schritt, was WendApply kann und wie du es als App auf dein Handy oder deinen Computer holst.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <LoginLink size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>App öffnen</LoginLink>
            <ButtonLink href="#installieren" size="lg" variant="secondary" icon={<Download size={18} strokeWidth={2.4} aria-hidden />}>Als App installieren</ButtonLink>
          </div>
          <p className="text-small mt-5 max-w-md text-muted">7 Tage gratis testen, mit Schullizenz gratis. Kein App Store nötig.</p>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <GuideShot src="/landing/04-dashboard-light.webp" darkSrc="/landing/04-dashboard-dark.webp" alt="Startseite von WendApply: Weg zur Lehrstelle mit Bewerbungen nach Status, zuletzt geänderte Bewerbungen und bald fällige Fristen" width={1600} height={1280} priority className="tilt-r" />
          <span className="sticker sticker-mint tilt-l3 absolute -bottom-4 left-3 text-sm">Auch als App</span>
        </div>
      </section>

      <Section id="funktionen" title={<>Alles für deine <span className="marker">Lehrstellensuche</span></>} intro="Das steckt in WendApply. Jede Karte führt dich zum passenden Schritt in der Anleitung." tint>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title: t, text, step }) => (
            <li key={t}>
              <a href={`#${step}`} className="panel card-interactive flex h-full gap-4 p-4 sm:flex-col sm:gap-3 sm:p-5">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]"><Icon size={21} strokeWidth={2.2} /></span>
                <span className="min-w-0">
                  <span className="text-heading block">{t}</span>
                  <span className="text-body mt-1.5 block text-muted sm:mt-2">{text}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <section id="anleitung" aria-labelledby="anleitung-h" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="anleitung-h" className="text-title max-w-3xl">Schritt für Schritt</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">Du musst nicht alles auf einmal machen. Starte mit den ersten drei Schritten, der Rest kommt mit der Zeit.</p>
        <div className="mt-8 grid gap-x-12 sm:mt-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside><Toc items={guideSteps.map((s) => ({ id: s.id, title: s.title }))} /></aside>
          <ol className="min-w-0 space-y-14 sm:space-y-16">
            {guideSteps.map((s, i) => (
              <li key={s.id} id={s.id} className="scroll-mt-24">
                <article aria-labelledby={`${s.id}-h`}>
                  <div className="flex items-baseline gap-4">
                    <span aria-hidden className="num-big text-[var(--brand)]">{i + 1}</span>
                    <h3 id={`${s.id}-h`} className="text-title !text-[clamp(1.4rem,1.2rem+1vw,1.9rem)]">{s.title}</h3>
                  </div>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{s.intro}</p>
                  <ol className="mt-5 max-w-2xl space-y-3">
                    {s.steps.map((st, j) => (
                      <li key={j} className="flex gap-3 text-[15px] leading-relaxed">
                        <span aria-hidden className="font-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[length:var(--border-w)] border-[var(--outline)] text-xs font-extrabold">{j + 1}</span>
                        <span>{st}</span>
                      </li>
                    ))}
                  </ol>
                  {s.tip && <p className="text-small mt-5 max-w-2xl rounded-[var(--radius-lg)] border-l-4 border-[var(--sun)] bg-[var(--surface-2)] px-4 py-3"><strong>Tipp:</strong> {s.tip}</p>}
                  {s.shot && <GuideShot {...s.shot} className="mt-7 max-w-3xl" />}
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Section id="installieren" title={<>WendApply als <span className="marker">App</span> installieren</>} intro="WendApply ist eine Web-App: Du lädst nichts aus dem App Store, sondern legst sie direkt aus dem Browser auf deinen Home-Bildschirm, ins Dock oder ins Startmenü. Sie öffnet sich dann im eigenen Fenster wie jede andere App." tint>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <InstallSection />
          <div className="space-y-4 text-[15px] leading-relaxed">
            <h3 className="text-heading">Warum installieren?</h3>
            <ul className="rows">
              <li className="py-3">Ein Tipp auf das Symbol, und du bist drin. Kein Suchen nach dem Link.</li>
              <li className="py-3">Eigenes Fenster ohne Adresszeile, mehr Platz für dein Dorf.</li>
              <li className="py-3">Auf dem iPhone bekommst du Mitteilungen nur mit der installierten App.</li>
              <li className="py-3">Updates kommen automatisch, du musst nie etwas aktualisieren.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="fragen" title="Häufige Fragen">
        <div className="max-w-3xl">
          <Faq items={faq} />
          <p className="text-small mt-5 text-muted">Mehr Antworten findest du unter <Link className="font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4" href="/hilfe">Hilfe</Link>.</p>
        </div>
      </Section>

      <section aria-labelledby="cta-h" className="mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="relative rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] px-6 py-10 text-[var(--on-sun)] shadow-[var(--shadow-lg)] sm:px-12 sm:py-14">
          <DoodleSparkle className="absolute right-6 top-6 h-8 w-8 sm:right-10" />
          <h2 id="cta-h" className="text-display max-w-2xl">Bereit? Deine erste Bewerbung wartet.</h2>
          <p className="mt-4 max-w-xl text-base">Konto erstellen dauert eine Minute. Danach kannst du WendApply jederzeit als App installieren.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LoginLink size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>App öffnen</LoginLink>
            <ButtonLink href="#installieren" size="lg" variant="secondary" className="!border-[var(--outline-fill)]">Als App installieren</ButtonLink>
          </div>
          <div className="pointer-events-none absolute bottom-6 right-8 hidden items-end gap-1 md:flex" aria-hidden>
            <DoodleTrail className="h-12 w-36" />
            <DoodlePlane className="mb-6 h-12 w-16" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
