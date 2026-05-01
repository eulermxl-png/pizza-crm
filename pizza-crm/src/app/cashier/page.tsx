import Link from "next/link";

export default function CashierHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-zinc-50">
          Panel de cajero
        </h2>
        <p className="mt-2 text-lg text-zinc-300">
          Accesos rápidos para crear pedidos y cerrar caja.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <Link
          href="/cashier/order"
          className="flex flex-1 items-center justify-center rounded-2xl bg-rondaAccent px-6 py-8 text-2xl font-black text-rondaCream shadow-[0_0_40px_rgba(61,31,15,0.35)] hover:bg-rondaAccentHover"
        >
          Nueva orden
        </Link>
        <Link
          href="/cashier/reconciliation"
          className="flex flex-1 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900/40 px-6 py-8 text-2xl font-black text-zinc-100 hover:bg-zinc-900/60"
        >
          Cierre de caja
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-zinc-500">
          Tip
        </p>
        <p className="mt-2 text-zinc-300">
          Si ya tienes un pedido activo, puedes avanzar su estado desde el
          panel “Pedidos activos” dentro de la pantalla de pedidos.
        </p>
      </div>
    </div>
  );
}
