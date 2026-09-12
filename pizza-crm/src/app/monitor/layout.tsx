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
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-50">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo-ronda.svg" alt="" height={36} />
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Monitoreo
              </p>
              <h1 className="text-xl font-black text-rondaCream">
                Saludo en caja
              </h1>
            </div>
          </div>
          <a
            href="/api/logout"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-900"
          >
            Cerrar sesión
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-4">
        {children}
      </main>
      <footer className="border-t border-zinc-900 py-2 text-center text-xs text-zinc-600">
        <Link href="/monitor" className="hover:text-zinc-400">
          Inicio
        </Link>
      </footer>
    </div>
  );
}
