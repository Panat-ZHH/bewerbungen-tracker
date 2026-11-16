"use client";

import { InvitePanel, JoinForm } from "./invite-panel";

/** Student without a family: join with a code from a parent or invite a parent. */
export function StudentStart({ initialCode, onChanged }: { initialCode: string; onChanged: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <JoinForm initialCode={initialCode} onJoined={onChanged} title="Code von deinen Eltern" intro="Hast du von deiner Mutter oder deinem Vater einen Code oder Link bekommen? Gib ihn hier ein." />
      <InvitePanel direction="child_invites_parent" />
      <p className="text-small text-muted lg:col-span-2">Bist du unter 16? Dann muss ein Elternteil zuerst zustimmen, bevor deine Familie etwas sieht. WendApply kannst du trotzdem sofort nutzen.</p>
    </div>
  );
}
