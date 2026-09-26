import type { ReactNode } from "react";
import Link from "next/link";

import { requireRole } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export default async function CrmLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // Ventas es el usuario principal; el owner también puede entrar.
  const role = await requireRole(["ventas", "owner"]);

  return (
    <div className="flex min-h-screen flex-col bg-surface3 text-rondaCream">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-ronda.svg" alt="" height={36} />
            <div>
              <p className="text-xs font-semibold uppercase text-muted2">Ventas</p>
              <h1 className="text-xl font-black text-rondaCream">
                CRM · Mayoreo congelado
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {role === "owner" ? (
              <Link
                href="/owner/wholesale"
                className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-rondaCream hover:bg-surface2"
              >
                Admin mayoreo
              </Link>
            ) : null}
            <a
              href="/api/logout"
              className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-rondaCream hover:bg-surface2"
            >
              Salir
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4">
        {children}
      </main>
    </div>
  );
}
