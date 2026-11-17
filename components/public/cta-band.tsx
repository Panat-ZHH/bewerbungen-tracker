import type { ReactNode } from "react";
import { FinalCta } from "./site-ui";

/** Closing call-to-action band of the public pages (calm dark band, see FinalCta). */
export function CtaBand({ id = "cta", title, text, children }: { id?: string; title: ReactNode; text: ReactNode; children: ReactNode }) {
  return <FinalCta id={id} title={title} text={text}>{children}</FinalCta>;
}
