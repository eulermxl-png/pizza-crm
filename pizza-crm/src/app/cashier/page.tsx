import Link from "next/link";

export default function CashierHomePage() {
  return (
    <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pb-4">
      <div>
        <h2 className="text-3xl font-black text-rondaCream">
          Panel de cajero
        </h2>
        <p className="mt-2 text-lg text-muted">
          Accesos rápidos para crear pedidos y cerrar caja.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-6">
        <Link
          href="/cashier/order"
          className="flex flex-1 min-w-[12rem] items-center justify-center rounded-2xl bg-rondaAccent px-6 py-8 text-2xl font-black text-rondaCream shadow-[0_0_40px_rgba(61,31,15,0.35)] hover:bg-rondaAccentHover"
        >
          Nueva orden
        </Link>
        <Link
          href="/cashier/tables"
          className="flex flex-1 min-w-[12rem] items-center justify-center rounded-2xl border border-line bg-surface2 px-6 py-8 text-2xl font-black text-rondaCream hover:bg-surface2"
        >
          Mesas
        </Link>
        <Link
          href="/cashier/reconciliation"
          className="flex flex-1 min-w-[12rem] items-center justify-center rounded-2xl border border-line bg-surface px-6 py-8 text-2xl font-black text-rondaCream hover:bg-surface2"
        >
          Cierre de caja
        </Link>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-muted2">
          Tip
        </p>
        <p className="mt-2 text-muted">
          Si ya tienes un pedido activo, puedes avanzar su estado desde el
          panel “Pedidos activos” dentro de la pantalla de pedidos.
        </p>
      </div>
    </div>
  );
}
