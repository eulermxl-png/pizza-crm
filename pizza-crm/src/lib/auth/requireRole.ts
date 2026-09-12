import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getUserRole } from "./getUserRole";
import type { Role } from "./role";

export async function requireRole(expected: Role) {
  // English comment: distinguish unauthenticated users from authenticated users
  // that are missing the profile row / role mapping in `public.users`.
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const role = await getUserRole();

  // Logged in, but no role/profile row found.
  if (!role) redirect("/no-access");

  // Logged in but wrong role.
  if (role !== expected) redirect("/no-access");

  return role;
}

