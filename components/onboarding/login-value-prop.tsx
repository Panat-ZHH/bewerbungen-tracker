import { BarChart3, MapPin, Users } from "lucide-react";

const bullets = [
  { icon: BarChart3, text: "Alle deine Bewerbungen an einem Ort" },
  { icon: MapPin, text: "Lehrstellen in deiner Nähe finden" },
  { icon: Users, text: "Mit Freunden und Klasse dranbleiben" },
];

/** One-sentence benefit + 3 bullets for 14–16-year-olds, shown next to (phones: above) the login form. */
export function LoginValueProp() {
  return (
    <div className="mt-4 max-w-md lg:mt-6">
      <p className="font-display text-lg font-semibold leading-snug tracking-[-.01em] lg:text-2xl">Finde deine Lehrstelle und behalte den Überblick über jede Bewerbung.</p>
      <ul className="rows mt-2 text-sm font-medium sm:text-[15px] lg:mt-6">
        {bullets.map(({ icon: Icon, text }) => <li key={text} className="flex items-center gap-3 py-2 lg:py-3"><Icon size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-[var(--brand)]" />{text}</li>)}
      </ul>
    </div>
  );
}
