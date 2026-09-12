import OrdersExportClient from "@/modules/reports/OrdersExportClient";

export const dynamic = "force-dynamic";

export default function OwnerOrdersExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Órdenes</h2>
        <p className="mt-2 max-w-3xl text-zinc-300">
          Exporta pedidos del período a Excel: resumen por orden y detalle de
          productos en una segunda hoja.
        </p>
      </div>
      <OrdersExportClient />
    </div>
  );
}
