"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { loadPendingOrders } from "@/lib/offline/offlineStorage";
import { SIZE_LABELS_ES, type SizeKey } from "@/modules/menu/constants";
import {
  orderStatusBadgeCompact,
  parseOrderPipelineStatus,
  shortOrderCode,
  type OrderPipelineStatus,
} from "@/modules/orders/lib/orderStatusWorkflow";

type ActiveLineItem = {
  id: string;
  quantity: number;
  size: string;
  productName: string;
  customizations: string[];
};

type ActiveOrderRow = {
  id: string;
  status: OrderPipelineStatus;
  created_at: string;
  origin: string;
  customerName: string | null;
  items: ActiveLineItem[];
  isLocal?: boolean;
};

type OrderRowDb = {
  id: string;
  status: string;
  created_at: string;
  origin: string;
  customer_name: string | null;
  order_items: {
    id: string;
    product_id: string;
    quantity: number;
    size: string;
    customizations: unknown;
  }[] | null;
};

function sizeLabel(size: string): string {
  if (size === "small" || size === "medium" || size === "large") {
    return SIZE_LABELS_ES[size as SizeKey];
  }
  return size;
}

function parseCustomizations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function itemSummaryLine(items: ActiveLineItem[]): string {
  return items
    .map((it) => `${it.quantity}x ${it.productName} (${sizeLabel(it.size)})`)
    .join(", ");
}

function originLabel(origin: string): string {
  return origin === "phone" ? "Teléfono" : "Mostrador";
}

function statusBadgeClass(status: OrderPipelineStatus): string {
  switch (status) {
    case "pending":
      return "border border-amber-400/50 bg-amber-500/25 text-amber-100";
    case "preparing":
      return "border border-sky-500/50 bg-sky-600/30 text-sky-100";
    case "ready":
      return "border border-emerald-500/50 bg-emerald-600/25 text-emerald-100";
    default:
      return "border border-zinc-600 bg-zinc-800 text-zinc-300";
  }
}

function buildRowsFromDb(
  rows: OrderRowDb[],
  productNames: Map<string, string>,
): ActiveOrderRow[] {
  const out: ActiveOrderRow[] = [];
  for (const r of rows) {
    const st = parseOrderPipelineStatus(String(r.status));
    if (!st || st === "delivered") continue;

    const items: ActiveLineItem[] = (r.order_items ?? []).map((it) => ({
      id: it.id,
      quantity: it.quantity,
      size: it.size,
      productName: productNames.get(it.product_id) ?? "Producto",
      customizations: parseCustomizations(it.customizations),
    }));

    out.push({
      id: r.id,
      status: st,
      created_at: r.created_at,
      origin: r.origin,
      customerName: r.customer_name,
      items,
    });
  }
  return out;
}

export default function CashierActiveOrdersPanel() {
  const supabase = useMemo(() => createClient(), []);
  const onlineStatus = useOnlineStatus();
  const isOnline = onlineStatus === "online";

  const [remoteRows, setRemoteRows] = useState<ActiveOrderRow[]>([]);
  const [localRows, setLocalRows] = useState<ActiveOrderRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    setPanelError(null);
    try {
      const pending = await loadPendingOrders();
      const mapped: ActiveOrderRow[] = pending.map((o) => {
        const st = parseOrderPipelineStatus(o.status);
        return {
          id: o.local_id,
          status: st ?? "pending",
          created_at: o.created_at,
          origin: o.origin,
          customerName: o.customer_name,
          items: o.items.map((it) => ({
            id: it.local_line_id,
            quantity: it.quantity,
            size: it.size,
            productName: it.productName,
            customizations: it.customizations,
          })),
          isLocal: true,
        };
      });

      setLocalRows(mapped);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Error al cargar pendientes.");
      setLocalRows([]);
    }
  }, []);

  const loadRemote = useCallback(async () => {
    if (!isOnline) return;
    setPanelError(null);

    const { data: orderRows, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        status,
        created_at,
        origin,
        customer_name,
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

    if (error) {
      setPanelError(error.message);
      setRemoteRows([]);
      return;
    }

    const raw = (orderRows ?? []) as OrderRowDb[];
    const productIds = new Set<string>();
    for (const o of raw) {
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
        setPanelError(pErr.message);
      } else {
        nameMap = new Map((prods ?? []).map((p) => [p.id, p.name]));
      }
    }

    setRemoteRows(buildRowsFromDb(raw, nameMap));
  }, [isOnline, supabase]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    // When online, load remote immediately.
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    // Update local list on IndexedDB changes.
    function onChanged() {
      void loadLocal();
    }
    window.addEventListener("pending_orders_changed", onChanged);
    return () => {
      window.removeEventListener("pending_orders_changed", onChanged);
    };
  }, [loadLocal]);

  useEffect(() => {
    if (!isOnline) return;

    const channel = supabase
      .channel("cashier-active-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void loadRemote();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          void loadRemote();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isOnline, supabase, loadRemote]);

  const combinedRows = useMemo(() => {
    const all = [...remoteRows, ...localRows];
    all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return all;
  }, [remoteRows, localRows]);

  useEffect(() => {
    if (selectedId && !combinedRows.some((r) => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [combinedRows, selectedId]);

  function toggleSelect(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
  }

  async function setStatus(orderId: string, next: OrderPipelineStatus) {
    const row = combinedRows.find((r) => r.id === orderId);
    if (!row || row.isLocal) return;

    setBusyId(orderId);
    setPanelError(null);

    if (next === "delivered") {
      setRemoteRows((prev) => prev.filter((r) => r.id !== orderId));
      setSelectedId((cur) => (cur === orderId ? null : cur));
    } else {
      setRemoteRows((prev) =>
        prev.map((r) => (r.id === orderId ? { ...r, status: next } : r)),
      );
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", orderId);

    if (error) {
      setPanelError(error.message);
      await loadRemote();
    }

    setBusyId(null);
  }

  return (
    <div className="mb-3 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Pedidos activos
        </p>
      </div>
      {panelError ? (
        <p className="px-3 py-2 text-xs text-red-300">{panelError}</p>
      ) : null}
      <div className="max-h-[min(70vh,28rem)] overflow-y-auto px-2 py-2">
        {combinedRows.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-zinc-500">
            Ninguno en cocina / mostrador
          </p>
        ) : (
          <ul className="space-y-2">
            {combinedRows.map((r) => {
              const expanded = selectedId === r.id;
              const busy = busyId === r.id;
              const summary = itemSummaryLine(r.items);
              const nameTrim = r.customerName?.trim() ?? "";
              const headerLabel = nameTrim || `#${shortOrderCode(r.id)}`;
              const selectedCls = expanded
                ? "border border-zinc-700 border-l-4 border-l-amber-500 bg-zinc-800/85 pl-2"
                : "border border-zinc-800 bg-zinc-950/60";

              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(r.id)}
                    className={`w-full rounded-lg px-2 py-2 text-left transition hover:bg-zinc-800/40 ${selectedCls}`}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <span
                        className={`min-w-0 shrink text-sm font-bold text-zinc-100 ${nameTrim ? "" : "font-mono"}`}
                      >
                        {headerLabel}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${statusBadgeClass(r.status)}`}
                      >
                        {orderStatusBadgeCompact(r.status)}
                      </span>
                      {r.isLocal ? (
                        <span className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300">
                          Local
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      Origen:{" "}
                      <span className="font-semibold text-zinc-300">
                        {originLabel(r.origin)}
                      </span>
                    </p>
                    {nameTrim ? (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Pedido{" "}
                        <span className="font-mono font-semibold text-zinc-400">
                          #{shortOrderCode(r.id)}
                        </span>
                      </p>
                    ) : null}
                    <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-zinc-400">
                      {summary || "Sin ítems"}
                    </p>
                  </button>

                  {expanded ? (
                    <div
                      className="mt-2 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/90 p-3"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <ul className="space-y-3 border-b border-zinc-800 pb-3">
                        {r.items.map((it) => (
                          <li key={it.id} className="text-sm text-zinc-200">
                            <p className="font-semibold text-zinc-50">
                              {it.quantity}× {it.productName}{" "}
                              <span className="font-normal text-zinc-400">
                                ({sizeLabel(it.size)})
                              </span>
                            </p>
                            {it.customizations.length > 0 ? (
                              <p className="mt-1 text-xs text-amber-200/90">
                                {it.customizations.join(" · ")}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {(
                          [
                            { key: "preparing" as const, label: "Preparando" },
                            { key: "ready" as const, label: "Listo" },
                            { key: "delivered" as const, label: "Entregado" },
                          ] as const
                        ).map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            disabled={busy || r.isLocal || r.status === key}
                            onClick={(e) => {
                              e.stopPropagation();
                              void setStatus(r.id, key);
                            }}
                            className={
                              r.status === key
                                ? "min-h-10 flex-1 rounded-lg border-2 border-zinc-600 bg-zinc-800 text-xs font-bold text-zinc-500"
                                : "min-h-10 flex-1 rounded-lg bg-emerald-700 px-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
