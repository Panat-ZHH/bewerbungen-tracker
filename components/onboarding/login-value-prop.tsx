import { BarChart3, MapPin, Users } from "lucide-react";

const bullets = [
  { icon: BarChart3, text: "Alle deine Bewerbungen an einem Ort" },
  { icon: MapPin, text: "Lehrstellen in deiner Nähe finden" },
  { icon: Users, text: "Mit Freunden und Klasse dranbleiben" },
];

/** One-sentence benefit + 3 bullets for 14–16-year-olds, shown above the login form on small screens. */
export function LoginValueProp() {
  return (
    <div className="mb-5 text-center lg:hidden">
      <p className="text-base font-semibold">Finde deine Lehrstelle und behalte den Überblick über jede Bewerbung.</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm text-muted">
        {bullets.map(({ icon: Icon, text }) => <li key={text} className="inline-flex items-center gap-1.5"><Icon size={14} aria-hidden className="text-[var(--brand)]" />{text}</li>)}
      </ul>
    </div>
  );
}
