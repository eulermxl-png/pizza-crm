import CashierOrderScreen from "@/modules/orders/CashierOrderScreen";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

// El cajero entra directo a la pantalla de pedido (nueva orden).
// Mesas y Cierre de caja quedan en la barra superior.
export default function CashierHomePage({ searchParams }: PageProps) {
  const tid = searchParams.tableId;
  const tableId =
    typeof tid === "string" && tid.trim().length > 0 ? tid.trim() : null;
  const b = searchParams.barra;
  const initialBarra = b === "1" || b === "true";
  /** Remount when query changes so mesa / barra / mostrador session state never leaks. */
  const sessionKey = `${initialBarra ? "bar" : "cnt"}-${tableId ?? "none"}`;
  return (
    <CashierOrderScreen
      key={sessionKey}
      initialTableId={tableId}
      initialBarra={initialBarra}
    />
  );
}
