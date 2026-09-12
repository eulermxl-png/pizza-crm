import ReportsClient from "@/modules/reports/ReportsClient";

export const dynamic = "force-dynamic";

export default function OwnerReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Reportes</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-muted">
          Ventas, pizzas por tipo, transacciones, saludo, ventas vs gastos y
          horas pico. La pestaña <strong>Órdenes</strong> exporta los pedidos
          del período a Excel.
        </p>
      </div>
      <ReportsClient />
    </div>
  );
}
