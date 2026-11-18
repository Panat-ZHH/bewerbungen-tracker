// Stand-in for lib/supabase.ts in unit tests. Set globalThis.__supabaseStub = { rpc(name, args) => {data, error} }.
// Optional: getUser() / getSession() / updateUser(attrs) for supabase.auth, and from(table, { select, eq }) => {data, error} for
// `supabase.from(t).select(c).eq(k, v).maybeSingle()` style reads.
const stub = () => globalThis.__supabaseStub ?? {};
function query(table) {
  const ops = { select: "*", eq: [] };
  const run = async () => (stub().from ? stub().from(table, ops) : { data: null, error: { message: "no stub" } });
  const builder = {
    select(columns) { ops.select = columns; return builder; },
    eq(column, value) { ops.eq.push([column, value]); return builder; },
    maybeSingle: run, single: run,
    then(resolve, reject) { return run().then(resolve, reject); },
  };
  return builder;
}
export const supabase = {
  rpc: async (name, args) => (stub().rpc ? stub().rpc(name, args) : { data: null, error: { message: "no stub" } }),
  from: (table) => query(table),
  auth: {
    getUser: async () => (stub().getUser ? stub().getUser() : { data: { user: null }, error: null }),
    getSession: async () => (stub().getSession ? stub().getSession() : { data: { session: null }, error: null }),
    updateUser: async (attrs) => (stub().updateUser ? stub().updateUser(attrs) : { data: { user: null }, error: null }),
  },
};
