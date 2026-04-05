import type { ReactNode } from "react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireRole("owner");

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950/60 p-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start justify-between gap-4 sm:block">
            <div>
              <p className="text-sm text-zinc-400">Modo</p>
              <h1 className="text-xl font-bold text-orange-400">Propietario</h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/owner"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 hover:bg-zinc-800"
            >
              Inicio
            </Link>
            <Link
              href="/owner/menu"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 hover:bg-zinc-800"
            >
              Menú
            </Link>
            <Link
              href="/owner/reports"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 hover:bg-zinc-800"
            >
              Reportes
            </Link>
            <Link
              href="/owner/expenses"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 hover:bg-zinc-800"
            >
              Gastos
            </Link>
            <Link
              href="/owner/reconciliation"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 hover:bg-zinc-800"
            >
              Cierre de caja
            </Link>
            <Link
              href="/api/logout"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-950 px-4 font-semibold text-zinc-200 hover:bg-zinc-900"
            >
              Cerrar sesión
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}

