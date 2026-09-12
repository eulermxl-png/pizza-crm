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

  // Modo demo global (solo con bandera de entorno; no aplica en producción).
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return role;

  // Camino normal: el rol coincide con el área (sin consultas extra).
  if (role === expected) return role;

  // Rol distinto al área: se permite SOLO si la cuenta es super_admin
  // (la barra de perfiles para navegar todo). El resto va a /no-access.
  const { data: sa } = await supabase
    .from("users")
    .select("super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if ((sa as { super_admin?: boolean } | null)?.super_admin === true) {
    return role;
  }

  redirect("/no-access");
}

