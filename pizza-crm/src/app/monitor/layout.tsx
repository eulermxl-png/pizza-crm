import type { ReactNode } from "react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export default async function MonitorLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireRole("monitor");

  return (
    <div className="flex min-h-screen flex-col bg-surface3 text-rondaCream">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo-ronda.svg" alt="" height={36} />
            <div>
              <p className="text-xs font-semibold uppercase text-muted2">
                Monitoreo
              </p>
              <h1 className="text-xl font-black text-rondaCream">
                Saludo en caja
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/monitor"
              className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-rondaCream hover:bg-surface2"
            >
              Saludo
            </Link>
            <Link
              href="/monitor/expenses"
              className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-rondaCream hover:bg-surface2"
            >
              Compras y gastos
            </Link>
            <a
              href="/api/logout"
              className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-rondaCream hover:bg-surface2"
            >
              Salir
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-4">
        {children}
      </main>
      <footer className="border-t border-line py-2 text-center text-xs text-muted2">
        <Link href="/monitor" className="hover:text-muted">
          Inicio
        </Link>
      </footer>
    </div>
  );
}
