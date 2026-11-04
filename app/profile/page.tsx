"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
        {notice && <p role="status" className="glass-surface mt-5 px-4 py-3 text-sm text-muted">{notice}</p>}
        {loading ? <div role="status" aria-label="Dein Profil wird geladen" className="glass-surface mt-7 space-y-5 p-5 sm:p-7">{[0, 1, 2, 3].map((item) => <div key={item} className="h-11 animate-pulse rounded-xl bg-white/70" />)}</div> : profile && (
          <form onSubmit={submit} className="glass-surface mt-7 rounded-[14px] p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map(({ key, label, type }) => (
                <label key={key} className={key === "email" || key === "location" ? "sm:col-span-2" : ""}>
                  <span className="mb-2 block text-sm font-medium">{label}</span>
                  <Input type={type ?? "text"} value={profile[key] ?? ""} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} />
                </label>
              ))}
            </div>
            <Button disabled={saving} className="mt-6 min-h-11 w-full px-5 sm:w-auto">
              {notice === "Gespeichert." ? <Check size={16} /> : null}{saving ? "Speichert …" : "Änderungen speichern"}
            </Button>
          </form>
        )}
      </div>
    </WorkspaceShell>
  );
}