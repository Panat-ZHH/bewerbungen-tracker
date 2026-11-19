import type { Metadata } from "next";
import { ConfirmEmail } from "@/components/funnel/confirm-email";

export const metadata: Metadata = { title: "Schau in dein Postfach" };

export default function ConfirmPage() {
  return <ConfirmEmail />;
}
