import ExpensesManagementClient from "@/modules/expenses/ExpensesManagementClient";

export const dynamic = "force-dynamic";

export default function OwnerExpensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Compras y Gastos</h2>
        <p className="mt-2 max-w-3xl text-zinc-300">
          Todo en un solo lugar: registra compras de insumos (suman inventario)
          y gastos generales (nómina, luz, renta). Filtra por período y exporta.
        </p>
      </div>
      <ExpensesManagementClient />
    </div>
  );
}
