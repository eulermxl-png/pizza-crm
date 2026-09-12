import CashierReconciliationClient from "@/modules/reconciliation/CashierReconciliationClient";

export const dynamic = "force-dynamic";

export default function CashierReconciliationPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <CashierReconciliationClient />
    </div>
  );
}
