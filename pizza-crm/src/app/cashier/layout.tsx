import type { ReactNode } from "react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/requireRole";
import CashierOfflineSync from "@/modules/offline/CashierOfflineSync";

export const dynamic = "force-dynamic";

export default async function CashierLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireRole("cashier");

  return (
    <div
      className="bg-zinc-950"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/60 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <img src="/logo-ronda.svg" alt="" height={40} />
            <div>
              <p className="text-sm text-zinc-400">Modo</p>
              <h1 className="text-xl font-bold text-rondaCream">Cajero</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/cashier"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 transition hover:bg-zinc-800"
            >
              Inicio
            </Link>
            <Link
              href="/cashier/tables"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 transition hover:bg-zinc-800"
            >
              Mesas
            </Link>
            <Link
              href="/cashier/reconciliation"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 transition hover:bg-zinc-800"
            >
              Cierre de caja
            </Link>
            <a
              href="/api/logout"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 font-semibold text-zinc-50 transition hover:bg-zinc-800"
            >
              Cerrar sesión
            </a>
          </div>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-[1920px] flex-1 px-2 pb-2 pt-2 sm:px-4"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <CashierOfflineSync />
        {children}
      </main>
    </div>
  );
}

