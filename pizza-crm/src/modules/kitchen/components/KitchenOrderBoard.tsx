"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { SIZE_LABELS_ES, type SizeKey } from "@/modules/menu/constants";

import {
  nextOrderStatusAction,
  orderStatusBadgeKitchen,
  type OrderPipelineStatus,
} from "@/modules/orders/lib/orderStatusWorkflow";

import {
  buildKitchenCard,
  type OrderRowDb,
} from "../lib/mapKitchenOrder";
import type { KitchenOrderCard } from "../types";

function sizeLabel(size: SizeKey | string): string {
  if (size === "small" || size === "medium" || size === "large") {
    return SIZE_LABELS_ES[size];
  }
  return size;
}

function originLabel(origin: KitchenOrderCard["origin"]): string {
  return origin === "phone" ? "Teléfono" : "Mostrador";
}

function formatElapsed(iso: string, nowMs: number): string {
  const start = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function OrderTimer({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="font-mono tabular-nums tracking-tight">
      {formatElapsed(createdAt, now)}
    </span>
  );
}

export default function KitchenOrderBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<KitchenOrderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setError(null);
    const { data: orderRows, error: oErr } = await supabase
      .from("orders")
      .select(
        `
        id,
        origin,
        customer_name,
        customer_phone,
        status,
        created_at,
        order_items (
          id,
          product_id,
          quantity,
          size,
          customizations
        )
      `,
      )
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at", { ascending: true });

    if (oErr) {
      setError(oErr.message);
      setOrders([]);
      return;
    }

    const rows = (orderRows ?? []) as OrderRowDb[];
    const productIds = new Set<string>();
    for (const o of rows) {
      for (const it of o.order_items ?? []) {
        productIds.add(it.product_id);
      }
    }

    let nameMap = new Map<string, string>();
    if (productIds.size > 0) {
      const { data: prods, error: pErr } = await supabase
        .from("products")
        .select("id, name")
        .in("id", Array.from(productIds));

      if (pErr) {
        setError(pErr.message);
      } else {
        nameMap = new Map((prods ?? []).map((p) => [p.id, p.name]));
      }
    }

    const cards: KitchenOrderCard[] = [];
    for (const row of rows) {
      const card = buildKitchenCard(row, nameMap);
      if (card) cards.push(card);
    }
    setOrders(cards);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadOrders();
      setLoading(false);
    })();
  }, [loadOrders]);

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void loadOrders();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          void loadOrders();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadOrders]);

  // RLS policy orders_kitchen_update allows kitchen to set status through delivered.
  async function advanceStatus(orderId: string, next: OrderPipelineStatus) {
    setBusyId(orderId);
    setError(null);

    if (next === "delivered") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)),
      );
    }

    const { error: uErr } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", orderId);

    if (uErr) {
      setError(uErr.message);
      await loadOrders();
    }

    setBusyId(null);
  }

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col bg-zinc-950"
      style={{ minHeight: 0 }}
    >
      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-lg font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="flex flex-1 items-center justify-center text-2xl font-semibold text-zinc-500">
          Cargando pedidos…
        </p>
      ) : orders.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-3xl font-bold text-zinc-500">
          Sin pedidos activos
        </p>
      ) : (
        <div
          className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-2 sm:p-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(22rem, 1fr))",
            alignContent: "start",
          }}
        >
          {orders.map((order, index) => {
            const urgent = index === 0;
            const action = nextOrderStatusAction(order.status);
            const isBusy = busyId === order.id;

            return (
              <article
                key={order.id}
                className={
                  urgent
                    ? "flex flex-col rounded-2xl border-4 border-amber-500 bg-zinc-900/90 p-5 shadow-[0_0_32px_rgba(245,158,11,0.25)]"
                    : "flex flex-col rounded-2xl border-2 border-zinc-700 bg-zinc-900/70 p-5"
                }
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-700 pb-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                      Pedido
                    </p>
                    <p className="text-4xl font-black tabular-nums text-zinc-50">
                      #{order.displayCode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                      Tiempo
                    </p>
                    <p className="text-4xl font-black text-amber-400">
                      <OrderTimer createdAt={order.createdAt} />
                    </p>
                  </div>
                </div>

                <div className="mb-4 space-y-2 text-xl font-semibold text-zinc-200">
                  <p>
                    <span className="text-zinc-500">Origen: </span>
                    {originLabel(order.origin)}
                  </p>
                  {order.origin === "phone" && order.customerName ? (
                    <p>
                      <span className="text-zinc-500">Cliente: </span>
                      {order.customerName}
                    </p>
                  ) : null}
                  {order.origin === "phone" && order.customerPhone ? (
                    <p className="text-lg text-zinc-400">
                      {order.customerPhone}
                    </p>
                  ) : null}
                </div>

                <div className="mb-2 inline-flex rounded-full bg-zinc-800 px-4 py-2 text-lg font-bold text-orange-300">
                  {orderStatusBadgeKitchen(order.status)}
                </div>

                <ul className="mb-6 max-h-[min(22rem,42vh)] space-y-4 overflow-y-auto pr-1">
                  {order.items.map((line) => (
                    <li
                      key={line.id}
                      className="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4"
                    >
                      <p className="text-2xl font-bold leading-tight text-zinc-50">
                        {line.quantity}× {line.productName}
                      </p>
                      <p className="mt-1 text-xl text-zinc-400">
                        {sizeLabel(line.size)}
                      </p>
                      {line.customizations.length > 0 ? (
                        <p className="mt-2 text-lg font-medium text-amber-200/90">
                          {line.customizations.join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {action ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void advanceStatus(order.id, action.next)}
                    className="mt-auto min-h-[4.5rem] w-full rounded-xl bg-emerald-600 text-2xl font-black text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isBusy ? "…" : action.label}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
