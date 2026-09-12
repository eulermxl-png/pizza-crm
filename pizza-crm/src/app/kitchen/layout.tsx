import type { ReactNode } from "react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export default async function KitchenLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireRole("kitchen");

  return (
    <div
      className="bg-surface3 text-rondaCream"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header className="shrink-0 border-b border-line bg-surface px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <img src="/logo-ronda.svg" alt="" height={40} />
            <div>
              <p className="text-base font-semibold text-muted2">Modo cocina</p>
              <h1 className="text-3xl font-black tracking-tight text-rondaCream sm:text-4xl">
                Inventario y pedidos
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/kitchen"
              className="inline-flex min-h-[3.25rem] shrink-0 items-center rounded-xl border border-line bg-surface2 px-6 text-lg font-bold text-rondaCream transition hover:bg-surface3"
            >
              Inicio
            </Link>
            <a
              href="/api/logout"
              className="inline-flex min-h-[3.25rem] shrink-0 items-center rounded-xl border-2 border-line bg-surface2 px-6 text-lg font-bold text-rondaCream transition hover:bg-surface3"
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
        {children}
      </main>
    </div>
  );
}
