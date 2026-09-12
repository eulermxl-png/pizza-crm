"use client";

import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    window.location.replace("/api/logout");
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] p-6">
      <p className="text-lg font-medium text-zinc-200">Cerrando sesión…</p>
      <p className="mt-2 text-sm text-zinc-500">Te redirigimos al inicio de sesión.</p>
    </main>
  );
}
