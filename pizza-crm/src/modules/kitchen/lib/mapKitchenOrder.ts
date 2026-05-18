import {
  SIZE_KEYS,
  STANDARD_PRODUCT_SIZE,
  type SizeKey,
} from "@/modules/menu/constants";
import { parseComboCustomizations } from "@/modules/orders/lib/comboItemMetadata";
import { resolveOrderDisplayCustomerName } from "@/modules/orders/lib/tableOrderGuestName";
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
    raw === "delivered" ||
    raw === "cancelled"
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

export type OrderRowDb = {
  id: string;
  origin: string;
  customer_name: string | null;
  customer_phone: string | null;
  table_id?: string | null;
  /** PostgREST may return one object or a single-element array for FK embeds. */
  tables?:
    | { customer_name: string | null }
    | { customer_name: string | null }[]
    | null;
  status: string;
  created_at: string;
  order_items: {
    id: string;
    product_id: string;
    quantity: number;
    size: string;
    customizations: unknown;
    is_combo_component?: boolean;
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
    const parsedCustomizations = parseComboCustomizations(it.customizations);
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
      customizations: parsedCustomizations.visible,
      showSizeLabel,
      isComboComponent: it.is_combo_component === true,
      comboGroupId: parsedCustomizations.comboGroupId,
    };
  });

  const parentByGroup = new Map<string, KitchenLineItem>();
  const root: KitchenLineItem[] = [];
  const childrenByGroup = new Map<string, KitchenLineItem[]>();

  for (const item of items) {
    if (!item.isComboComponent) {
      root.push(item);
      if (item.comboGroupId) parentByGroup.set(item.comboGroupId, item);
      continue;
    }
    if (!item.comboGroupId) {
      root.push(item);
      continue;
    }
    const bucket = childrenByGroup.get(item.comboGroupId) ?? [];
    bucket.push(item);
    childrenByGroup.set(item.comboGroupId, bucket);
  }

  const orderedItems: KitchenLineItem[] = [];
  for (const item of root) {
    orderedItems.push(item);
    if (!item.comboGroupId) continue;
    if (!parentByGroup.has(item.comboGroupId)) continue;
    const children = childrenByGroup.get(item.comboGroupId) ?? [];
    orderedItems.push(...children);
    childrenByGroup.delete(item.comboGroupId);
  }
  for (const dangling of Array.from(childrenByGroup.values())) {
    orderedItems.push(...dangling);
  }

  return {
    id: row.id,
    displayCode: shortOrderCode(row.id),
    origin: row.origin === "phone" ? "phone" : "walk_in",
    customerName: resolveOrderDisplayCustomerName(row),
    customerPhone: row.customer_phone,
    status,
    createdAt: row.created_at,
    items: orderedItems,
  };
}
