import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/role";

/**
 * Para rutas API usadas desde la app: valida la sesión (cookie de Supabase)
 * y que el rol esté permitido. Devuelve el cliente con los permisos (RLS) del usuario.
 */
export async function requireRoleApi(allowed: Role[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: "Inicia sesión." }, { status: 401 }) } as const;
  }
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const role = profile?.role as Role | undefined;
  if (!role || !allowed.includes(role)) {
    return { error: Response.json({ error: "No tienes permiso para esto." }, { status: 403 }) } as const;
  }
  return { supabase, role, userId: user.id } as const;
}
