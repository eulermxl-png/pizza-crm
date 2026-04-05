import Link from "next/link";

export default function NoAccessPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
        <h1 className="text-2xl font-bold text-orange-400">
          Acceso no permitido
        </h1>
        <p className="mt-3 text-zinc-300">
          Tu cuenta esta autenticada, pero no tiene permiso para ver este
          modulo.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-lg bg-zinc-800 px-4 font-semibold text-zinc-50 transition hover:bg-zinc-700"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

