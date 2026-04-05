import { getOfflineDb } from "./indexeddb";
import type {
  OfflineCachedMenu,
  OfflinePendingOrder,
} from "./offlineTypes";

export async function saveMenuCache(menu: {
  products: OfflineCachedMenu["products"];
  customizations: OfflineCachedMenu["customizations"];
}) {
  const db = await getOfflineDb();
  const record: OfflineCachedMenu = {
    id: "menu",
    products: menu.products,
    customizations: menu.customizations,
    savedAt: new Date().toISOString(),
  };

  await db.put("menu_cache", record);
  // Best-effort backward write for older store name.
  try {
    await db.put("cached_menu", record);
  } catch {
    // ignore
  }
}

export async function loadMenuCache(): Promise<
  OfflineCachedMenu | null
> {
  const db = await getOfflineDb();

  const cached = (await db.get("menu_cache", "menu")) as
    | OfflineCachedMenu
    | undefined;
  if (cached) return cached;

  // Backward compatibility fallback.
  const legacy = (await db.get("cached_menu", "menu")) as
    | OfflineCachedMenu
    | undefined;
  return legacy ?? null;
}

export async function addPendingOrder(order: OfflinePendingOrder) {
  const db = await getOfflineDb();
  await db.put("pending_orders", order);

  notifyPendingOrdersChanged();
}

export async function removePendingOrder(local_id: string) {
  const db = await getOfflineDb();
  await db.delete("pending_orders", local_id);
  notifyPendingOrdersChanged();
}

export async function loadPendingOrders(): Promise<
  OfflinePendingOrder[]
> {
  const db = await getOfflineDb();
  const all = (await db.getAll("pending_orders")) as OfflinePendingOrder[];
  return all ?? [];
}

export async function clearPendingOrders() {
  const db = await getOfflineDb();
  const all = await loadPendingOrders();
  await Promise.all(all.map((o) => db.delete("pending_orders", o.local_id)));
  notifyPendingOrdersChanged();
}

export function notifyPendingOrdersChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pending_orders_changed"));
}

