import { Check, ShieldCheck, X } from "lucide-react";

const shared = ["Firma und Position", "Status (z. B. Beworben, Gespräch)", "Frist, Bewerbungsdatum und Ort", "Anzahl deiner Bewerbungen"];
const never = ["Notizen", "Gehalt", "Stellenbeschreibung", "Lebensläufe und Dokumente", "Deine E-Mail-Adresse"];

/** Plain-language list of what a teacher or a friend can and cannot see. */
export function PrivacyPanel({ variant, teacherName }: { variant: "class" | "friends"; teacherName?: string }) {
  const sees = variant === "class" ? shared : ["Anzahl deiner Bewerbungen", "Wie viele davon in welchem Status sind", "Deinen Fortschritt auf der Karte"];
  const never_ = variant === "class" ? never : ["Firmen und Positionen", "Fristen", ...never.slice(0, 4)];
  const who = variant === "class" ? (teacherName ? teacherName : "Deine Lehrperson") : "Deine Freunde";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--info-line)] bg-[var(--info-bg)] p-3.5 text-[var(--info-fg)]">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} className="shrink-0" /> Was {who} sieht</p>
      <div className="text-small mt-2 grid gap-3 sm:grid-cols-2">
        <ul className="space-y-1" aria-label="Sichtbar">{sees.map((t) => <li key={t} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0" aria-hidden />{t}</li>)}</ul>
        <ul className="space-y-1" aria-label="Nie sichtbar">{never_.map((t) => <li key={t} className="flex gap-1.5"><X size={14} className="mt-0.5 shrink-0" aria-hidden />{t}</li>)}</ul>
      </div>
      <p className="text-small mt-2">Du kannst die Freigabe jederzeit pausieren oder beenden.</p>
    </div>
  );
}
