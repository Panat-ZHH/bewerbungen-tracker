"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarEditor } from "@/components/profile/avatar-editor";
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
      <div className="max-w-2xl pb-safe">
        <PageHeader title="Dein Profil" description="Deine Kontaktdaten an einem Ort." />
        {notice && <StatusMessage tone={notice === "Gespeichert." ? "success" : "danger"} icon={notice === "Gespeichert." ? <Check /> : undefined} className="mb-5">{notice}</StatusMessage>}
        <AvatarEditor name={[profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.email || "Profil"} />
        {loading ? (
          <Card><CardContent role="status" aria-label="Dein Profil wird geladen" className="grid gap-5 sm:grid-cols-2 sm:p-7">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="space-y-2"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-11" /></div>)}</CardContent></Card>
        ) : profile && (
          <Card className="animate-rise"><form onSubmit={submit} className="p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map(({ key, label, type }) => (
                <Field key={key} label={label} htmlFor={`profile-${key}`} className={key === "email" || key === "location" ? "sm:col-span-2" : ""}>
                  <Input id={`profile-${key}`} type={type ?? "text"} value={profile[key] ?? ""} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} />
                </Field>
              ))}
            </div>
            <Button loading={saving} full className="mt-6 sm:w-auto">{saving ? "Speichert …" : "Änderungen speichern"}</Button>
          </form></Card>
        )}
      </div>
    </WorkspaceShell>
  );
}