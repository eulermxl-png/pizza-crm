import type { SupabaseClient } from "@supabase/supabase-js";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * First client-side requests often run before the browser client finishes
 * hydrating the session from cookies, so RLS can return [] with no error.
 */
export async function waitForClientAuthSession(
  supabase: SupabaseClient,
  maxMs = 10000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return;
    await sleep(100);
  }
}

type PgResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

/**
 * Re-runs the query when Supabase returns no rows but no error (transient RLS / session lag).
 */
export async function loadQueryWithEmptyRetry<T>(
  run: () => PromiseLike<PgResult<T>>,
  isConsideredEmpty: (data: T | null) => boolean,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<PgResult<T>> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 300;
  let last: PgResult<T> = { data: null, error: null };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await Promise.resolve(run());
    if (last.error) return last;
    if (!isConsideredEmpty(last.data)) return last;
    if (attempt < maxAttempts - 1) {
      await sleep(baseDelayMs + attempt * 200);
    }
  }

  return last;
}
