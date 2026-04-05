import OwnerReconciliationHistoryClient from "@/modules/reconciliation/OwnerReconciliationHistoryClient";

export const dynamic = "force-dynamic";

export default function OwnerReconciliationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Cierres de caja</h2>
        <p className="mt-2 max-w-3xl text-zinc-300">
          Historial de arqueos: efectivo y tarjeta en sistema vs. corte del
          terminal de tarjeta.
        </p>
      </div>
      <OwnerReconciliationHistoryClient />
    </div>
  );
}
