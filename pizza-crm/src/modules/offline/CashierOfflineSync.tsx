"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import {
  loadPendingOrders,
  removePendingOrder,
} from "@/lib/offline/offlineStorage";
import type { OfflinePendingOrder } from "@/lib/offline/offlineTypes";

type BannerState =
  | { kind: "offline" }
  | { kind: "syncing" }
  | { kind: "synced"; count: number }
  | { kind: "idle" };

export default function CashierOfflineSync() {
  const supabase = useMemo(() => createClient(), []);
  const onlineStatus = useOnlineStatus();

  const [banner, setBanner] = useState<BannerState>(() => ({
    kind: onlineStatus === "offline" ? "offline" : "idle",
  }));
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncingRef = useRef(false);
  const lastOnlineSyncAttemptAt = useRef<number>(0);

  useEffect(() => {
    if (onlineStatus === "offline") {
      syncingRef.current = false;
      setSyncError(null);
      setBanner({ kind: "offline" });
      return;
    }

    // Online: try to sync pending orders if any.
    void (async () => {
      const now = Date.now();
      if (syncingRef.current) return;
      if (now - lastOnlineSyncAttemptAt.current < 1500) return; // throttle
      lastOnlineSyncAttemptAt.current = now;

      try {
        setSyncError(null);
        const pending = await loadPendingOrders();
        if (pending.length === 0) {
          setBanner({ kind: "idle" });
          return;
        }

        syncingRef.current = true;
        setBanner({ kind: "syncing" });

        let syncedCount = 0;
        for (const localOrder of pending) {
          await syncOne(supabase, localOrder);
          await removePendingOrder(localOrder.local_id);
          syncedCount += 1;
        }

        setBanner({ kind: "synced", count: syncedCount });
      } catch (e) {
        // Keep pending orders in DB; next online event can retry.
        setSyncError(e instanceof Error ? e.message : "Error al sincronizar.");
        const isNetworkError =
          e instanceof TypeError ||
          (e instanceof Error &&
            /fetch failed|network|networkerror|failed to fetch|timeout|timed out|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(
              e.message ?? "",
            ));

        if (isNetworkError) {
          // Make the offline banner show immediately.
          window.dispatchEvent(
            new Event("supabase_connection_failed"),
          );
        }

        setBanner({ kind: "idle" });
      } finally {
        syncingRef.current = false;
        // Hide synced banner after a short time.
        setTimeout(() => setBanner({ kind: "idle" }), 3500);
      }
    })();
  }, [onlineStatus, supabase]);

  if (onlineStatus === "offline") {
    return (
      <>
        <div className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/40 px-4 py-3 text-center text-sm font-semibold text-amber-100">
          Sin conexión - Los pedidos se guardarán localmente
        </div>
        {syncError ? (
          <div className="mb-3 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {syncError}
          </div>
        ) : null}
      </>
    );
  }

  if (banner.kind === "syncing") {
    return (
      <div className="mb-3 rounded-xl border border-sky-900/50 bg-sky-950/30 px-4 py-3 text-center text-sm font-semibold text-sky-100">
        Conexión restaurada - Sincronizando...
      </div>
    );
  }

  if (banner.kind === "synced") {
    return (
      <div className="mb-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-center text-sm font-semibold text-emerald-100">
        {banner.count} pedidos sincronizados
      </div>
    );
  }

  if (syncError) {
    return (
      <div className="mb-3 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
        {syncError}
      </div>
    );
  }

  return null;
}

async function syncOne(
  supabase: ReturnType<typeof createClient>,
  localOrder: OfflinePendingOrder,
) {
  // Insert order row first.
  const cash_amount =
    localOrder.cash_amount ??
    (localOrder.payment_method === "cash" ? localOrder.total : 0);
  const card_amount =
    localOrder.card_amount ??
    (localOrder.payment_method === "card" ? localOrder.total : 0);

  const { data: orderRow, error: oErr } = await supabase
    .from("orders")
    .insert({
      origin: localOrder.origin,
      customer_name: localOrder.customer_name,
      customer_phone: localOrder.customer_phone,
      status: localOrder.status,
      payment_method: localOrder.payment_method,
      discount: localOrder.discount,
      total: localOrder.total,
      cash_amount,
      card_amount,
      created_at: localOrder.created_at,
    })
    .select("id")
    .single();

  if (oErr) throw new Error(oErr.message);
  if (!orderRow?.id) throw new Error("Pedido no creado (sync offline).");

  const itemRows = localOrder.items.map((it) => ({
    order_id: orderRow.id,
    product_id: it.product_id,
    size: it.size,
    quantity: it.quantity,
    unit_price: it.unit_price,
    customizations: it.customizations,
  }));

  const { error: iErr } = await supabase.from("order_items").insert(itemRows);
  if (iErr) throw new Error(iErr.message);

  return orderRow.id;
}

