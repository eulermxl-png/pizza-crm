import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
import { getUserRole } from "@/lib/auth/getUserRole";
import { roleToPath } from "@/lib/auth/role";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const role = await getUserRole();

  if (role) redirect(roleToPath(role));

  return (
    <main className="min-h-screen bg-[var(--background)] p-6">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 pt-10">
        <img src="/logo-ronda.svg" alt="" height={80} />
        <p className="text-center text-rondaCream">
          Acceso por rol: propietario, cajero, cocina o monitoreo.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
