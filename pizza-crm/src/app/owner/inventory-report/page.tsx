import InventoryReportClient from "@/modules/inventory-report/InventoryReportClient";

export const dynamic = "force-dynamic";

export default function OwnerInventoryReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">
          Reporte de Inventario
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm text-muted">
          Existencia con semáforo, valor del inventario, qué reordenar y merma.
        </p>
      </div>
      <InventoryReportClient />
    </div>
  );
}
