"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getProfile, saveProfile } from "@/lib/storage";
import type { Profile as ProfileType } from "@/types";

const fields: { key: keyof ProfileType; label: string; type?: string }[] = [
  { key: "firstName", label: "Vorname" },
  { key: "lastName", label: "Nachname" },
  { key: "email", label: "E-Mail", type: "email" },
  { key: "phone", label: "Telefon" },
  { key: "location", label: "Wohnort" },
  { key: "website", label: "Webseite" },
  { key: "linkedIn", label: "LinkedIn" },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileType>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getProfile().then((data) => { if (active) setProfile(data); }).catch(() => { if (active) setNotice("Dein Profil konnte nicht geladen werden."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setNotice("");
    try {
      await saveProfile(profile);
      setNotice("Gespeichert.");
    } catch {
      setNotice("Deine Angaben konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceShell active="Profile">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Dein Profil</h1>
        <p className="mt-2 text-base text-muted">Deine Kontaktdaten an einem Ort.</p>
        {notice && <p role="status" className="mt-5 rounded-xl bg-white px-4 py-3 text-sm text-muted">{notice}</p>}
        {loading ? <p className="mt-7 text-sm text-muted">Dein Profil wird geladen …</p> : profile && (
          <form onSubmit={submit} className="glass-surface mt-7 rounded-[14px] p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map(({ key, label, type }) => (
                <label key={key} className={key === "email" || key === "location" ? "sm:col-span-2" : ""}>
                  <span className="mb-2 block text-sm font-medium">{label}</span>
                  <input type={type ?? "text"} value={profile[key] ?? ""} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} className="min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15" />
                </label>
              ))}
            </div>
            <button disabled={saving} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white hover:bg-[#075bbb] disabled:opacity-60">
              {notice === "Gespeichert." ? <Check size={16} /> : null}{saving ? "Speichert …" : "Änderungen speichern"}
            </button>
          </form>
        )}
      </div>
    </WorkspaceShell>
  );
}