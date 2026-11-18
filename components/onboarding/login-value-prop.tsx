import { BarChart3, Eye, GraduationCap, Heart, MapPin, QrCode, ShieldCheck, Users } from "lucide-react";

/** Who the login/signup page is talking to (eltern-22, lehrperson-04, schule-23): pupils, parents or school staff. */
export type LoginAudience = "student" | "parent" | "staff";

const copy: Record<LoginAudience, { lead: string; bullets: { icon: typeof BarChart3; text: string }[] }> = {
  student: {
    lead: "Finde deine Lehrstelle und behalte den Überblick über jede Bewerbung.",
    bullets: [
      { icon: BarChart3, text: "Alle deine Bewerbungen an einem Ort" },
      { icon: MapPin, text: "Lehrstellen in deiner Nähe finden" },
      { icon: Users, text: "Mit Freunden und Klasse dranbleiben" },
    ],
  },
  parent: {
    lead: "Begleite dein Kind bei der Lehrstellensuche.",
    bullets: [
      { icon: Eye, text: "Sieh, wie weit dein Kind ist" },
      { icon: ShieldCheck, text: "Dein Kind entscheidet, was es teilt" },
      { icon: Heart, text: "Ein Familienpaket für euch beide" },
    ],
  },
  staff: {
    lead: "Den Fortschritt deiner Klasse im Blick.",
    bullets: [
      { icon: GraduationCap, text: "Klasse in einer Minute erstellen" },
      { icon: QrCode, text: "Schüler:innen per Code, Link oder QR einladen" },
      { icon: ShieldCheck, text: "Du siehst nur, was die Schüler:innen freigeben" },
    ],
  },
};

/** One-sentence benefit + 3 bullets, shown next to (phones: above) the login form. */
export function LoginValueProp({ audience = "student" }: { audience?: LoginAudience }) {
  const { lead, bullets } = copy[audience];
  return (
    <div className="mt-4 max-w-md lg:mt-6">
      <p className="font-display text-lg font-semibold leading-snug tracking-[-.01em] lg:text-2xl">{lead}</p>
      <ul className="rows mt-2 text-sm font-medium sm:text-[15px] lg:mt-6">
        {bullets.map(({ icon: Icon, text }) => <li key={text} className="flex items-center gap-3 py-2 lg:py-3"><Icon size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-[var(--brand)]" />{text}</li>)}
      </ul>
    </div>
  );
}
