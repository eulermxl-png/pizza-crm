// English: use literal `process.env.NEXT_PUBLIC_*` access so Next.js inlines values
// in Edge middleware bundles. Dynamic `process.env[key]` is not replaced and becomes undefined.

function requireEnv(name: string, raw: string | undefined) {
  const value = raw?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  get supabaseUrl() {
    return requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey() {
    return requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
};
