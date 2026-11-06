"use client";

import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * SLOT for the notification settings. Part i1 replaces this component (keep the name and the default props);
 * the settings page only renders <NotificationSettings /> and knows nothing else about it.
 */
export function NotificationSettings() {
  return (
    <Card className="animate-rise mt-4" data-testid="notification-settings"><CardContent>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Bell size={18} /></span>
        <div className="min-w-0">
          <h2 className="text-heading">Benachrichtigungen</h2>
          <p className="mt-1 text-body text-muted">Hier kannst du bald einstellen, woran WendApply dich erinnert – zum Beispiel an Fristen und Rückmeldungen.</p>
        </div>
      </div>
    </CardContent></Card>
  );
}
