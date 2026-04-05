import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/config/env";

export const createClient = () =>
  createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
