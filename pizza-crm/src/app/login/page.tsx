import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
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

export default async function LoginPage() {
  const role = await getUserRole();

  if (role) redirect(roleToPath(role));

  return (
    <main className="min-h-screen bg-[var(--background)] p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pt-10">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-orange-400">
            Pizza CRM
          </h1>
          <p className="text-zinc-300">
            Acceso por rol: propietario, cajero o cocina.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

