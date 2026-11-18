import { Suspense } from "react";
import { StudentOnboarding } from "@/components/onboarding/student-onboarding";
import { OnboardingRoute } from "@/components/onboarding/onboarding-route";
import { AccessGuard } from "@/components/access/access-guard";

export const metadata = { title: "Willkommen" };

export default function OnboardingPage() {
  return <Suspense fallback={null}><OnboardingRoute><AccessGuard><StudentOnboarding /></AccessGuard></OnboardingRoute></Suspense>;
}
