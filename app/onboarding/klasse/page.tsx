import { Suspense } from "react";
import { ClassCodeStep } from "@/components/onboarding/class-code-step";

export const metadata = { title: "Klassencode" };

export default function Page() {
  return <Suspense fallback={null}><ClassCodeStep /></Suspense>;
}
