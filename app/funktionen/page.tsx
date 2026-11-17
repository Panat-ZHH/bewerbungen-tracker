import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicShell } from "@/components/public/public-shell";
import { ButtonLink, Checks, FinalCta, MoreLink, PageHero, PhoneShot, Shot, SiteSection } from "@/components/public/site-ui";
import { SIGNUP_HREF, TRIAL_DAYS } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/funktionen" });

type Feature = { id: string; title: string; text: string; list?: string[]; shot: string; alt: string; caption: string };

const features: Feature[] = [
  { id: "stellen", title: "Stellen suchen", text: "Eine Suche für mehrere Stellenbörsen: Yousty, jobs.ch und jobup.ch. Filtere nach Ort, Umkreis und Art der Stelle. Standardmässig siehst du Stellen in der Schweiz.",
    list: ["Lehrstellen und Schnupperlehren", "Lehrbetriebe auf der Karte", "Mit einem Tipp merken"],
    shot: "m-search", alt: "Lehrstellensuche: Suche nach «Informatiker» mit Treffern aus Yousty und jobs.ch in der ganzen Schweiz", caption: "Treffer aus mehreren Stellenbörsen, nach Ort und Umkreis gefiltert." },
  { id: "bewerbungen", title: "Bewerbungen und Fristen", text: "Von «Gemerkt» bis «Vertrag unterschrieben»: Jede Bewerbung zeigt ihren Status, die Frist, die Ansprechperson und deine Notizen.",
    list: ["Schnupperlehre, Eignungstest und Gespräche festhalten", "Erinnerungen auf der Startseite, per E-Mail oder als Benachrichtigung", "Termine in deinen Kalender übernehmen"],
    shot: "m-applications", alt: "Bewerbungsliste mit Filtern und Bewerbungen bei erfundenen Lehrbetrieben, jede mit ihrem Status", caption: "Alle Bewerbungen mit Status auf einen Blick." },
  { id: "dokumente", title: "Dokumente", text: "Lebenslauf, Motivationsschreiben, Zeugnisse und Foto an einem Ort. Eine Checkliste zeigt, ob dein Bewerbungsdossier komplett ist.",
    shot: "m-cvs", alt: "Dokumente in WendApply: Checkliste «Dein Dossier ist komplett» mit Lebenslauf und Motivationsschreiben", caption: "Dokumente einmal hochladen, an jede Bewerbung anhängen." },
  { id: "dorf", title: "Dein Dorf", text: "Jede Bewerbung wird ein Haus, das mit deinem Fortschritt wächst. Mit Punkten kaufst du im Laden Deko und schaltest neue Inseln frei. Punkte gibt es für sinnvolle Schritte, nie für Geld.",
    shot: "m-dorf", alt: "Das Dorf in WendApply: Häuser für Bewerbungen mit Beschriftungen wie Zusage, Schnupperlehre gemacht und Gespräch", caption: "Dein Fortschritt als Dorf." },
];

const more = [
  { title: "Bewerbungs-Check", text: "Der KI-Bewerbungs-Check gibt dir Punkte und konkrete Tipps für dein Motivationsschreiben, mit Vorher-Nachher-Sätzen. Dein Text geht dafür an einen KI-Dienst; die Datei wird nicht gespeichert." },
  { title: "Freunde und Klasse", text: "Gemeinsam geht es leichter. Du entscheidest, was Freunde, deine Lehrperson und deine Eltern sehen. Notizen und Dokumente bleiben immer privat." },
  { title: "Auswertung", text: "Sieh, wie viele Bewerbungen unterwegs sind, wie viele Antworten und Gespräche du hast." },
];

export default function FunktionenPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/funktionen")} />

      <PageHero id="funktionen-h" kicker="Funktionen" title="Alles für deine Lehrstellensuche"
        lead="WendApply läuft im Browser und lässt sich als App auf Handy und Computer installieren. Ohne App Store."
        note={`${TRIAL_DAYS} Tage gratis für Schülerinnen, Schüler und Eltern, ohne Zahlungsangaben.`}>
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
        <ButtonLink href="/anleitung" size="lg" variant="secondary">Anleitung ansehen</ButtonLink>
      </PageHero>

      {features.map((f, i) => (
        <section key={f.id} id={f.id} aria-labelledby={`${f.id}-h`} className={`s-section ${i % 2 ? "s-section-tint" : ""}`}>
          <div className={`s-wrap s-grid-2 ${i % 2 ? "s-flip" : ""}`}>
            <div>
              <span className="s-num" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <h2 id={`${f.id}-h`} className="s-h2">{f.title}</h2>
              <p className="s-lead">{f.text}</p>
              {f.list && <Checks items={f.list} />}
            </div>
            <Shot center caption={f.caption}><PhoneShot name={f.shot} alt={f.alt} /></Shot>
          </div>
        </section>
      ))}

      <SiteSection id="mehr" title="Und ausserdem">
        <ul className="s-cols s-cols-3">
          {more.map((m) => <li key={m.title}><h3 className="s-h3">{m.title}</h3><p className="s-text">{m.text}</p></li>)}
        </ul>
        <Checks plain items={["Freunde per Einladungscode", "Klasse per Einladungslink, Klassencode oder QR-Code", "Familie: Fortschritt mit Eltern teilen"]} />
      </SiteSection>

      <SiteSection id="lehrpersonen" title="Für Lehrpersonen" tint>
        <p className="s-lead" style={{ marginTop: 0 }}>Klassen erstellen, Fortschritt sehen, Fristen und Mitteilungen an alle senden.</p>
        <div className="s-actions" style={{ marginTop: 16 }}><MoreLink href="/schulen">Für Schulen und Lehrpersonen</MoreLink></div>
      </SiteSection>

      <FinalCta title="Probier es aus" text={`${TRIAL_DAYS} Tage gratis, ohne Zahlungsangaben.`}>
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
