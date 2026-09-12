import OwnerReconciliationHistoryClient from "@/modules/reconciliation/OwnerReconciliationHistoryClient";

export const dynamic = "force-dynamic";

export default function OwnerReconciliationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Cierres de caja</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-muted">
          Historial de arqueos: efectivo (con fondo) y tarjeta del sistema vs.
          lo contado y el corte del terminal.
        </p>
      </div>
      <OwnerReconciliationHistoryClient />
    </div>
  );
}
