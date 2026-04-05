import { SIZE_KEYS, type SizeKey } from "@/modules/menu/constants";
import { shortOrderCode } from "@/modules/orders/lib/orderStatusWorkflow";

import type { KitchenLineItem, KitchenOrderCard, KitchenOrderStatus } from "../types";

const ACTIVE_STATUSES: KitchenOrderStatus[] = [
  "pending",
  "preparing",
  "ready",
];

function parseStatus(raw: string): KitchenOrderStatus | null {
  if (
    raw === "pending" ||
    raw === "preparing" ||
    raw === "ready" ||
    raw === "delivered"
  ) {
    return raw;
  }
  return null;
}

function parseSize(raw: string): SizeKey | string {
  return (SIZE_KEYS as readonly string[]).includes(raw)
    ? (raw as SizeKey)
    : raw;
}

function parseCustomizations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export type OrderRowDb = {
  id: string;
  origin: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  created_at: string;
  order_items: {
    id: string;
    product_id: string;
    quantity: number;
    size: string;
    customizations: unknown;
  }[] | null;
};

export function buildKitchenCard(
  row: OrderRowDb,
  productNames: Map<string, string>,
): KitchenOrderCard | null {
  const status = parseStatus(row.status);
  if (!status || !ACTIVE_STATUSES.includes(status)) return null;

  const items: KitchenLineItem[] = (row.order_items ?? []).map((it) => ({
    id: it.id,
    quantity: it.quantity,
    size: parseSize(it.size),
    productName: productNames.get(it.product_id) ?? "Producto",
    customizations: parseCustomizations(it.customizations),
  }));

  return {
    id: row.id,
    displayCode: shortOrderCode(row.id),
    origin: row.origin === "phone" ? "phone" : "walk_in",
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    status,
    createdAt: row.created_at,
    items,
  };
}
