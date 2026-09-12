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
      <header className="border-b border-line bg-surface2 p-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <img src="/logo-ronda.svg" alt="" height={40} />
            <div>
              <p className="text-sm text-muted">Modo</p>
              <h1 className="text-xl font-bold text-rondaCream">Propietario</h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/owner"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Inicio
            </Link>
            <Link
              href="/owner/menu"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Menú
            </Link>
            <Link
              href="/owner/inventory"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Catálogos
            </Link>
            <Link
              href="/owner/reports"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Reportes
            </Link>
            <Link
              href="/owner/expenses"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Compras y Gastos
            </Link>
            <Link
              href="/owner/recipes"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Recetas
            </Link>
            <Link
              href="/owner/inventory-report"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Inventario
            </Link>
            <Link
              href="/owner/reconciliation"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Cierre de caja
            </Link>
            <Link
              href="/owner/wholesale"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream hover:bg-surface3"
            >
              Mayoreo
            </Link>
            <a
              href="/api/logout"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface3 px-4 font-semibold text-rondaCream hover:bg-surface2"
            >
              Cerrar sesión
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}

