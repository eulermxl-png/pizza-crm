import ExpensesManagementClient from "@/modules/expenses/ExpensesManagementClient";

export const dynamic = "force-dynamic";

export default function OwnerExpensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Gastos</h2>
        <p className="mt-2 max-w-3xl text-zinc-300">
          Registra y analiza egresos por período. Exporta a Excel cuando lo
          necesites.
        </p>
      </div>
      <ExpensesManagementClient />
    </div>
  );
}
