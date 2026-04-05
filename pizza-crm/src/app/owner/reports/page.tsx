import ReportsDashboardClient from "@/modules/reports/ReportsDashboardClient";

export const dynamic = "force-dynamic";

export default function OwnerReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Reportes</h2>
        <p className="mt-2 max-w-3xl text-zinc-300">
          Ventas, productos estrella, comparación con gastos y patrones de hora.
          Usa un solo rango de fechas para todo el tablero.
        </p>
      </div>
      <ReportsDashboardClient />
    </div>
  );
}
