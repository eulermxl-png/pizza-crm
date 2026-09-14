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
      className="bg-surface3"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header className="shrink-0 border-b border-line bg-surface2 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <img src="/logo-ronda.svg" alt="" height={40} />
            <div>
              <p className="text-sm text-muted">Modo</p>
              <h1 className="text-xl font-bold text-rondaCream">Cajero</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/cashier"
              className="inline-flex h-11 items-center rounded-lg bg-rondaAccent px-4 font-semibold text-rondaCream transition hover:bg-rondaAccentHover"
            >
              Nueva orden
            </Link>
            <Link
              href="/cashier/tables"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream transition hover:bg-surface3"
            >
              Mesas
            </Link>
            <Link
              href="/cashier/reconciliation"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream transition hover:bg-surface3"
            >
              Cierre de caja
            </Link>
            <a
              href="/api/logout"
              className="inline-flex h-11 items-center rounded-lg border border-line bg-surface2 px-4 font-semibold text-rondaCream transition hover:bg-surface3"
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

