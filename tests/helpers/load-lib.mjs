import { register } from "node:module";
let registered = false;
/** Imports a lib/*.ts file that uses "@/" aliases (supabase is stubbed, see supabase-stub.mjs). */
export async function loadLib(name) {
  if (!registered) { register("./alias-hooks.mjs", import.meta.url); registered = true; }
  return import(`../../lib/${name}.ts`);
}
