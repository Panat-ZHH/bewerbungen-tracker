"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { getVisibilityInfo, type VisibilityInfo } from "@/lib/classes";

// Fallback texts, used only while the server text (class_visibility_info) is loading. They mirror the three switches in lib/consent.ts.
const shared = ["Immer: deinen Namen und dein Profilbild", "Mit «Fortschritt teilen»: Anzahl, letzte Aktivität, Bewerbungsdatum und Frist", "Mit «Status zeigen»: den Stand jeder Bewerbung", "Mit «Firmen zeigen»: Firma, Stelle und Ort"];
const never = ["Deine Notizen", "Gehaltsangaben", "Stellenbeschreibungen", "Lebensläufe, Dokumente und Zeugnisse", "Deine E-Mail-Adresse"];

/** Plain-language list of what a teacher or a friend can and cannot see. */
export function PrivacyPanel({ variant, teacherName }: { variant: "class" | "friends"; teacherName?: string }) {
  const [info, setInfo] = useState<VisibilityInfo | null>(null);
  useEffect(() => { if (variant !== "class") return; let alive = true; getVisibilityInfo().then((v) => { if (alive && v.teacherSees.length && v.teacherNeverSees.length) setInfo(v); }).catch(() => {}); return () => { alive = false; }; }, [variant]);
  const sees = info ? info.teacherSees : variant === "class" ? shared : ["Anzahl deiner Bewerbungen", "Wie viele davon in welchem Status sind", "Deinen Fortschritt auf der Karte"];
  const never_ = info ? info.teacherNeverSees : variant === "class" ? never : ["Zusagen und Absagen (ausser du schaltest das ein)", "Firmennamen (ausser du schaltest das ein)", "Positionen und Stellenlinks", "Fristen", ...never.slice(0, 4)];
  const who = variant === "class" ? (teacherName ? teacherName : "deine Lehrperson") : "deine Freunde";
  const verb = variant === "class" ? "sieht" : "sehen";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--info-line)] bg-[var(--info-bg)] p-3.5 text-[var(--info-fg)]">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} className="shrink-0" /> Was {who} {verb}</p>
      <div className="text-small mt-2 grid gap-3 sm:grid-cols-2">
        <ul className="space-y-1" aria-label="Sichtbar">{sees.map((t) => <li key={t} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0" aria-hidden />{t}</li>)}</ul>
        <ul className="space-y-1" aria-label="Nie sichtbar">{never_.map((t) => <li key={t} className="flex gap-1.5"><X size={14} className="mt-0.5 shrink-0" aria-hidden />{t}</li>)}</ul>
      </div>
      <p className="text-small mt-2">{variant === "class" ? "Du kannst jeden dieser Schalter jederzeit ändern. Ohne «Fortschritt teilen» sieht deine Lehrperson nur deinen Namen." : "Du kannst das Teilen mit Freunden jederzeit in den Freundes-Einstellungen ausschalten."}</p>
    </div>
  );
}
