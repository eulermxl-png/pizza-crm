import Link from "next/link";

export default function OwnerHomePage() {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-2xl font-bold text-rondaCream">
        Panel del propietario
      </h2>
      <p className="mt-2 text-muted">
        Gestiona el menú o avanza a otros módulos cuando estén listos.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/owner/menu"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-rondaAccent px-5 font-semibold text-rondaCream hover:bg-rondaAccentHover"
        >
          Ir al menú
        </Link>
      </div>
    </section>
  );
}

