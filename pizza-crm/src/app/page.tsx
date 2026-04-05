import { redirect } from "next/navigation";

import { getUserRole } from "@/lib/auth/getUserRole";
import type { Role } from "@/lib/auth/role";

export const dynamic = "force-dynamic";

function roleToPath(role: Role) {
  switch (role) {
    case "owner":
      return "/owner";
    case "cashier":
      return "/cashier";
    case "kitchen":
      return "/kitchen";
  }
}

export default async function Home() {
  const role = await getUserRole();

  if (!role) redirect("/login");

  redirect(roleToPath(role));
}
