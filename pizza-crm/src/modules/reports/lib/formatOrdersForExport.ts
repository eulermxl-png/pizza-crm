import {
  sizeChoiceLabelEs,
  STANDARD_PRODUCT_SIZE,
} from "@/modules/menu/constants";
import { shortOrderCode } from "@/modules/orders/lib/orderStatusWorkflow";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

export type DbOrderExport = {
  id: string;
  created_at: string;
  customer_name: string | null;
  origin: string;
  status: string;
  payment_method: string | null;
  discount: number | string;
  total: number | string;
  cash_amount: number | string | null;
  card_amount: number | string | null;
  table_id: string | null;
};

export type DbItemExport = {
  order_id: string;
  product_id: string;
  size: string;
  quantity: number;
  unit_price: number | string;
  customizations: unknown;
};

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function statusEs(status: string): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "preparing":
      return "En preparación";
    case "ready":
      return "Listo";
    case "delivered":
      return "Entregado";
    default:
      return status;
  }
}

function paymentMethodEs(pm: string | null): string {
  if (pm === "cash") return "Efectivo";
  if (pm === "card") return "Tarjeta";
  if (pm === "mixed") return "Mixto";
  return "";
}

/** Same split logic as reconciliation when legacy rows have no cash/card split. */
function displayCashCard(
  total: number,
  pm: string | null,
  cashAmt: number,
  cardAmt: number,
): { cash: number; card: number } {
  const useSplit =
    cashAmt > 0 || cardAmt > 0 || pm === "mixed";
  if (useSplit) {
    return {
      cash: Math.round(cashAmt * 100) / 100,
      card: Math.round(cardAmt * 100) / 100,
    };
  }
  if (pm === "cash") return { cash: Math.round(total * 100) / 100, card: 0 };
  if (pm === "card") return { cash: 0, card: Math.round(total * 100) / 100 };
  return { cash: 0, card: 0 };
}

function originLabel(
  origin: string,
  tableId: string | null,
  tableName: string | null,
): string {
  if (origin === "phone") return "Teléfono";
  if (!tableId) return "Mostrador";
  const n = (tableName ?? "").trim().toLowerCase();
  if (n === "barra") return "Barra";
  return "Mesa";
}

function personalizationText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw.filter((x): x is string => typeof x === "string").join(", ");
}

function oneLineProductLabel(
  qty: number,
  productName: string,
  size: string,
): string {
  const sz =
    size === STANDARD_PRODUCT_SIZE ? "" : sizeChoiceLabelEs(size);
  const base = `${qty}x ${productName}`;
  return sz ? `${base} ${sz}` : base;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function buildOrdersExportRows(
  orders: DbOrderExport[],
  items: DbItemExport[],
  productNames: Map<string, string>,
  tableNames: Map<string, string>,
): {
  summary: Record<string, string | number>[];
  detail: Record<string, string | number>[];
} {
  const itemsByOrder = new Map<string, DbItemExport[]>();
  for (const it of items) {
    const cur = itemsByOrder.get(it.order_id) ?? [];
    cur.push(it);
    itemsByOrder.set(it.order_id, cur);
  }

  const summary: Record<string, string | number>[] = [];

  for (const o of orders) {
    const tableName = o.table_id ? tableNames.get(o.table_id) ?? null : null;
    const total = num(o.total);
    const c0 = num(o.cash_amount);
    const d0 = num(o.card_amount);
    const { cash, card } = displayCashCard(total, o.payment_method, c0, d0);

    const lines = itemsByOrder.get(o.id) ?? [];
    const productBits = lines
      .map((it) => {
        const name = productNames.get(it.product_id) ?? "Producto";
        return oneLineProductLabel(it.quantity, name, it.size);
      })
      .sort((a, b) => a.localeCompare(b, "es"));
    const productos = productBits.join(", ");

    summary.push({
      "Fecha y hora": formatDateTime(o.created_at),
      "Número de orden": shortOrderCode(o.id),
      "Nombre de la orden": o.customer_name?.trim() ?? "",
      Origen: originLabel(o.origin, o.table_id, tableName),
      Mesa: o.table_id ? (tableName ?? "") : "",
      Estado: statusEs(String(o.status)),
      "Método de pago": paymentMethodEs(o.payment_method),
      Efectivo: cash,
      Tarjeta: card,
      Descuento: Math.round(num(o.discount) * 100) / 100,
      Total: Math.round(total * 100) / 100,
      Productos: productos,
    });
  }

  const detail: Record<string, string | number>[] = [];
  for (const o of orders) {
    const lines = itemsByOrder.get(o.id);
    if (!lines?.length) continue;
    const created = o.created_at;
    const ymd = toLocalYmd(new Date(created));
    const code = shortOrderCode(o.id);
    const sorted = [...lines].sort((a, b) => {
      const na = productNames.get(a.product_id) ?? "";
      const nb = productNames.get(b.product_id) ?? "";
      return na.localeCompare(nb, "es");
    });
    for (const it of sorted) {
      const name = productNames.get(it.product_id) ?? "Producto";
      const unit = num(it.unit_price);
      const qty = it.quantity;
      const sub = Math.round(unit * qty * 100) / 100;
      detail.push({
        Fecha: ymd,
        "Número de orden": code,
        Producto: name,
        Tamaño: sizeChoiceLabelEs(it.size),
        Cantidad: qty,
        "Precio unitario": unit,
        Personalizaciones: personalizationText(it.customizations),
        Subtotal: sub,
      });
    }
  }

  return { summary, detail };
}
