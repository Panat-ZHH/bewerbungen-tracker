"use client";

import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarEditor } from "@/components/profile/avatar-editor";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useAccess } from "@/components/access/access-provider";
import { friendlyMessage } from "@/lib/ux";
import { toast } from "@/lib/toast";
import { getProfile, saveProfile } from "@/lib/storage";
import { getMyNameStatus, setMyDisplayName } from "@/lib/profile-names";
import { clearRoleCache } from "@/lib/role";
import { SCHOOL_LEVELS, startYearOptions } from "@/lib/onboarding-core";
import { CANTONS } from "@/lib/geo/cantons";
import type { Profile as ProfileType } from "@/types";

type Who = "student" | "parent" | "staff";
type TextKey = "firstName" | "lastName" | "email" | "phone" | "location" | "school";

/** Contact fields per role (eltern-10, lehrperson-02): parents and teachers don't get the pupil fields. */
const contactFields: { key: TextKey; label: string; type?: string; autoComplete?: string; wide?: boolean; only?: Who }[] = [
  { key: "firstName", label: "Vorname", autoComplete: "given-name" },
  { key: "lastName", label: "Nachname", autoComplete: "family-name" },
  { key: "email", label: "E-Mail", type: "email", autoComplete: "email", wide: true },
  { key: "phone", label: "Telefon (optional)", type: "tel", autoComplete: "tel" },
  { key: "location", label: "Wohnort", autoComplete: "address-level2", only: "student" },
  { key: "school", label: "Schule (optional)", only: "student", wide: true },
];

const splitProfessions = (raw: string) => raw.split(",").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);

export default function ProfilePage() {
  return <WorkspaceShell active="Profile"><ProfileContent /></WorkspaceShell>;
}

function ProfileContent() {
  const { access } = useAccess();
  const who: Who = access?.role === "teacher" || access?.role === "school_admin" ? "staff" : access?.account_type === "parent" || access?.role === "parent" ? "parent" : "student";
  const [profile, setProfile] = useState<ProfileType>();
  const [professions, setProfessions] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getProfile(), getMyNameStatus().catch(() => null)])
      .then(([data, names]) => { if (!active) return; setProfile(data); setProfessions((data.desiredProfessions ?? []).join(", ")); setDisplayName(names?.displayName ?? ""); })
      .catch((reason) => { if (active) setNotice(friendlyMessage(reason, "Dein Profil konnte nicht geladen werden. Lade die Seite neu.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setNotice("");
    try {
      await saveProfile(who === "student" ? { ...profile, desiredProfessions: splitProfessions(professions) } : profile);
      if (who === "staff" && displayName.trim()) { await setMyDisplayName(displayName.trim()); clearRoleCache(); }
      toast({ message: "Änderungen gespeichert." });
    } catch (reason) {
      setNotice(friendlyMessage(reason, "Deine Angaben konnten nicht gespeichert werden. Versuch es noch einmal."));
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<ProfileType>) => profile && setProfile({ ...profile, ...patch });
  const description = who === "student" ? "Deine Angaben für die Suche und deine Bewerbungen." : who === "staff" ? "So sehen dich deine Klassen." : "Deine Kontaktdaten an einem Ort.";

  return (
    <div className="max-w-4xl pb-safe">
      <PageHeader title="Mein Profil" description={description} />
      {notice && <StatusMessage tone="danger" className="mb-5">{notice}</StatusMessage>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-12">
        <AvatarEditor name={[profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Profil"} />
        {loading ? (
          <Card><CardContent role="status" aria-label="Dein Profil wird geladen" className="grid gap-5 sm:grid-cols-2 sm:p-7">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="space-y-2"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-11" /></div>)}</CardContent></Card>
        ) : profile && (
          <Card className="animate-rise"><form onSubmit={submit} className="p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              {who === "staff" && (
                <Field label="Anzeigename (sichtbar für deine Klassen)" htmlFor="profile-displayName" hint="So erscheinst du bei deinen Schülerinnen und Schülern, z. B. «Frau Keller»." className="sm:col-span-2">
                  <Input id="profile-displayName" autoComplete="nickname" value={displayName} maxLength={60} onChange={(event) => setDisplayName(event.target.value)} />
                </Field>
              )}
              {contactFields.filter((f) => !f.only || f.only === who).map(({ key, label, type, autoComplete, wide }) => (
                <Field key={key} label={label} htmlFor={`profile-${key}`} className={wide ? "sm:col-span-2" : ""}>
                  <Input id={`profile-${key}`} type={type ?? "text"} autoComplete={autoComplete} value={profile[key] ?? ""} onChange={(event) => set({ [key]: event.target.value })} />
                </Field>
              ))}
              {who === "student" && (<>
                <Field label="Kanton" htmlFor="profile-canton">
                  <Select id="profile-canton" value={profile.canton ?? ""} onChange={(e) => set({ canton: e.target.value })}>
                    <option value="">Bitte wählen</option>
                    {CANTONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Klasse / Niveau" htmlFor="profile-schoolLevel">
                  <Select id="profile-schoolLevel" value={profile.schoolLevel ?? ""} onChange={(e) => set({ schoolLevel: e.target.value })}>
                    <option value="">Bitte wählen</option>
                    {/* Keep an older free-text value selectable instead of silently dropping it. */}
                    {profile.schoolLevel && !(SCHOOL_LEVELS as readonly string[]).includes(profile.schoolLevel) && <option value={profile.schoolLevel}>{profile.schoolLevel}</option>}
                    {SCHOOL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </Select>
                </Field>
                <Field label="Wunschberufe" htmlFor="profile-professions" hint="Mehrere mit Komma trennen, z. B. Informatiker:in, Mediamatiker:in." className="sm:col-span-2">
                  <Input id="profile-professions" value={professions} onChange={(event) => setProfessions(event.target.value)} />
                </Field>
                <Field label="Gewünschter Lehrbeginn" htmlFor="profile-startYear">
                  <Select id="profile-startYear" value={profile.desiredStartYear ? String(profile.desiredStartYear) : ""} onChange={(e) => set({ desiredStartYear: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Weiss ich noch nicht</option>
                    {profile.desiredStartYear && !startYearOptions().includes(profile.desiredStartYear) && <option value={profile.desiredStartYear}>Sommer {profile.desiredStartYear}</option>}
                    {startYearOptions().map((y) => <option key={y} value={y}>Sommer {y}</option>)}
                  </Select>
                </Field>
              </>)}
            </div>
            <Button loading={saving} full className="mt-7 sm:w-auto">{saving ? "Speichert …" : "Änderungen speichern"}</Button>
          </form></Card>
        )}
      </div>
    </div>
  );
}
