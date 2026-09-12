import Link from "next/link";

export default function NoAccessPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg rounded-xl border border-line bg-surface p-6">
        <h1 className="text-2xl font-bold text-rondaCream">
          Acceso no permitido
        </h1>
        <p className="mt-3 text-muted">
          Tu cuenta esta autenticada, pero no tiene permiso para ver este
          modulo.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-lg bg-surface3 px-4 font-semibold text-rondaCream transition hover:bg-surface3"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

