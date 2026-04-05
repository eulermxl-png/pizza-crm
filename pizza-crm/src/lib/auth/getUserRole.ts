import { createClient } from "@/lib/supabase/server";
import type { Role } from "./role";

// Gets the current user's role from `public.users` using their auth UID.
export async function getUserRole(): Promise<Role | null> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.role) return null;

  const role = profile.role as unknown;

  if (role === "owner" || role === "cashier" || role === "kitchen") {
    return role;
  }

  return null;
}

