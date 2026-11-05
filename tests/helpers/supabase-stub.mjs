// Stand-in for lib/supabase.ts in unit tests. Set globalThis.__supabaseStub = { rpc(name, args) => {data, error} }.
export const supabase = {
  rpc: async (name, args) => (globalThis.__supabaseStub?.rpc ? globalThis.__supabaseStub.rpc(name, args) : { data: null, error: { message: "no stub" } }),
};
