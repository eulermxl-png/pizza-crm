import {
  SIZE_KEYS,
  STANDARD_PRODUCT_SIZE,
  type SizeKey,
} from "@/modules/menu/constants";
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
  if (raw === STANDARD_PRODUCT_SIZE) return STANDARD_PRODUCT_SIZE;
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

export type ProductMeta = {
  name: string;
  has_sizes: boolean;
};

export function buildKitchenCard(
  row: OrderRowDb,
  productsById: Map<string, ProductMeta>,
): KitchenOrderCard | null {
  const status = parseStatus(row.status);
  if (!status || !ACTIVE_STATUSES.includes(status)) return null;

  const items: KitchenLineItem[] = (row.order_items ?? []).map((it) => {
    const meta = productsById.get(it.product_id);
    const name = meta?.name ?? "Producto";
    const hasSizes = meta?.has_sizes !== false;
    const parsed = parseSize(it.size);
    const showSizeLabel =
      hasSizes && it.size !== STANDARD_PRODUCT_SIZE && parsed !== "standard";

    return {
      id: it.id,
      quantity: it.quantity,
      size: parsed,
      productName: name,
      customizations: parseCustomizations(it.customizations),
      showSizeLabel,
    };
  });

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
