// Module-resolution hook so lib files that import "@/..." can be loaded by node --test.
// "@/lib/supabase" is replaced by a stub whose rpc()/from() calls are recorded and answered by globalThis.__supabaseStub.
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
export async function resolve(specifier, context, next) {
  if (specifier === "@/lib/supabase") return { url: pathToFileURL(join(ROOT, "tests/helpers/supabase-stub.mjs")).href, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", ".mjs", ""]) { const file = join(ROOT, specifier.slice(2) + ext); if (ext && existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true }; }
  }
  return next(specifier, context);
}
