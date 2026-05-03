import CashierOrderScreen from "@/modules/orders/CashierOrderScreen";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function CashierOrderPage({ searchParams }: PageProps) {
  const tid = searchParams.tableId;
  const tableId =
    typeof tid === "string" && tid.trim().length > 0 ? tid.trim() : null;
  const b = searchParams.barra;
  const initialBarra = b === "1" || b === "true";
  return (
    <CashierOrderScreen initialTableId={tableId} initialBarra={initialBarra} />
  );
}

