import { Suspense } from "react";
import { StudentOnboarding } from "@/components/onboarding/student-onboarding";

export const metadata = { title: "Willkommen – WendApply" };

export default function OnboardingPage() {
  return <Suspense fallback={null}><StudentOnboarding /></Suspense>;
}
