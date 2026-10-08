import CashflowClient from "@/modules/cashflow/CashflowClient";

export const dynamic = "force-dynamic";

export default function OwnerCashflowPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Flujo de efectivo</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-muted">
          Cuánto dinero entra y sale cada semana (caja + banco) y cómo se ve el próximo mes.
          Captura los pagos que vienen para que la proyección sea real.
        </p>
      </div>
      <CashflowClient />
    </div>
  );
}
