import { redirect } from "next/navigation";

import { getUserRole } from "@/lib/auth/getUserRole";
import { roleToPath } from "@/lib/auth/role";

export const dynamic = "force-dynamic";

export default async function Home() {
  const role = await getUserRole();

  if (!role) redirect("/login");

  redirect(roleToPath(role));
}
