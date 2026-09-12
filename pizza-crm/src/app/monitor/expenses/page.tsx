import ExpensesManagementClient from "@/modules/expenses/ExpensesManagementClient";

export const dynamic = "force-dynamic";

export default function MonitorExpensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Compras y Gastos</h2>
        <p className="mt-2 max-w-3xl text-muted">
          Registra compras de insumos (suman inventario) y gastos generales.
          Filtra por período y exporta.
        </p>
      </div>
      <ExpensesManagementClient />
    </div>
  );
}
