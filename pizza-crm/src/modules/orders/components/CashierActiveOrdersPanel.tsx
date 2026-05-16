"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { loadPendingOrders } from "@/lib/offline/offlineStorage";
import { sizeChoiceLabelEs } from "@/modules/menu/constants";
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

type TableCardRow = {
  tableId: string;
  tableName: string;
  customerName: string | null;
  openedAt: string | null;
  startedAt: string;
  comandaCount: number;
  unpaidTotal: number;
};

type PanelCard =
  | { kind: "order"; sortAt: string; order: ActiveOrderRow }
  | { kind: "table"; sortAt: string; table: TableCardRow };

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

type TableRowDb = {
  id: string;
  name: string;
  customer_name: string | null;
  opened_at: string | null;
  status: string;
};

function parseCustomizations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function itemSummaryLine(items: ActiveLineItem[]): string {
  return items
    .map(
      (it) =>
        `${it.quantity}x ${it.productName} (${sizeChoiceLabelEs(it.size)})`,
    )
    .join(", ");
}

function originLabel(origin: string): string {
  return origin === "phone" ? "Teléfono" : "Mostrador";
}

function formatPlacedClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatElapsed(openedAt: string, nowMs: number): string {
  const start = new Date(openedAt).getTime();
  const sec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${m}m ${s.toString().padStart(2, "0")}s`;
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
    if (!st || st === "delivered" || st === "cancelled") continue;

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
  const [tableRows, setTableRows] = useState<TableCardRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

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
      setPanelError(
        e instanceof Error ? e.message : "Error al cargar pendientes.",
      );
      setLocalRows([]);
    }
  }, []);

  const loadRemoteOrders = useCallback(async () => {
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
      .eq("is_table_order", false)
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

  const loadTableCards = useCallback(async () => {
    if (!isOnline) {
      setTableRows([]);
      return;
    }
    const { data: tables, error: tErr } = await supabase
      .from("tables")
      .select("id,name,customer_name,opened_at,status")
      .in("status", ["occupied", "waiting_payment"])
      .order("opened_at", { ascending: true, nullsFirst: false });

    if (tErr) {
      setPanelError(tErr.message);
      setTableRows([]);
      return;
    }

    const tRows = (tables ?? []) as TableRowDb[];
    if (tRows.length === 0) {
      setTableRows([]);
      return;
    }

    const ids = tRows.map((t) => t.id);
    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select("table_id,total,created_at,status,payment_method")
      .in("table_id", ids)
      .is("payment_method", null)
      .neq("status", "cancelled");

    if (oErr) {
      setPanelError(oErr.message);
      setTableRows([]);
      return;
    }

    const agg = new Map<string, { count: number; total: number; firstAt: string | null }>();
    for (const id of ids) {
      agg.set(id, { count: 0, total: 0, firstAt: null });
    }
    for (const o of orders ?? []) {
      const tid = (o as { table_id?: string | null }).table_id;
      if (!tid || !agg.has(tid)) continue;
      const cur = agg.get(tid)!;
      cur.count += 1;
      cur.total += Number((o as { total?: number | string }).total) || 0;
      const createdAt = String((o as { created_at?: string }).created_at ?? "");
      if (!cur.firstAt || new Date(createdAt).getTime() < new Date(cur.firstAt).getTime()) {
        cur.firstAt = createdAt;
      }
      agg.set(tid, cur);
    }

    const cards: TableCardRow[] = tRows.map((t) => {
      const a = agg.get(t.id) ?? { count: 0, total: 0, firstAt: null };
      const startedAt = t.opened_at ?? a.firstAt ?? new Date().toISOString();
      return {
        tableId: t.id,
        tableName: t.name,
        customerName: t.customer_name,
        openedAt: t.opened_at,
        startedAt,
        comandaCount: a.count,
        unpaidTotal: Math.round(a.total * 100) / 100,
      };
    });

    setTableRows(cards);
  }, [isOnline, supabase]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    void loadRemoteOrders();
    void loadTableCards();
  }, [loadRemoteOrders, loadTableCards]);

  useEffect(() => {
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
          void loadRemoteOrders();
          void loadTableCards();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          void loadRemoteOrders();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tables" },
        () => {
          void loadTableCards();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isOnline, supabase, loadRemoteOrders, loadTableCards]);

  const allOrderRows = useMemo(
    () => [...remoteRows, ...localRows].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
    [remoteRows, localRows],
  );

  const cards = useMemo(() => {
    const out: PanelCard[] = [
      ...allOrderRows.map((order) => ({
        kind: "order" as const,
        sortAt: order.created_at,
        order,
      })),
      ...tableRows.map((table) => ({
        kind: "table" as const,
        sortAt: table.startedAt,
        table,
      })),
    ];
    out.sort((a, b) => new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime());
    return out;
  }, [allOrderRows, tableRows]);

  useEffect(() => {
    if (selectedOrderId && !allOrderRows.some((r) => r.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [allOrderRows, selectedOrderId]);

  function toggleSelect(id: string) {
    setSelectedOrderId((cur) => (cur === id ? null : id));
  }

  async function setStatus(orderId: string, next: OrderPipelineStatus) {
    const row = allOrderRows.find((r) => r.id === orderId);
    if (!row || row.isLocal) return;

    setBusyId(orderId);
    setPanelError(null);

    if (next === "delivered") {
      setRemoteRows((prev) => prev.filter((r) => r.id !== orderId));
      setSelectedOrderId((cur) => (cur === orderId ? null : cur));
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
      await loadRemoteOrders();
    }

    setBusyId(null);
  }

  async function confirmCancelOrder() {
    if (!cancelTargetId) return;
    const orderId = cancelTargetId;
    const reason = cancelReason.trim();
    const row = allOrderRows.find((r) => r.id === orderId);
    if (!row || row.isLocal) {
      setCancelTargetId(null);
      setCancelReason("");
      return;
    }

    setBusyId(orderId);
    setPanelError(null);
    setRemoteRows((prev) => prev.filter((r) => r.id !== orderId));
    setSelectedOrderId((cur) => (cur === orderId ? null : cur));
    setCancelTargetId(null);
    setCancelReason("");

    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_reason: reason.length > 0 ? reason : null,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      setPanelError(error.message);
      await loadRemoteOrders();
    } else {
      await loadTableCards();
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
      <div className="max-h-[min(42vh,18rem)] overflow-y-auto px-2 py-2">
        {cards.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-zinc-500">
            Sin órdenes activas
          </p>
        ) : (
          <ul className="space-y-2">
            {cards.map((card) => {
              if (card.kind === "table") {
                const t = card.table;
                const customerTrim = t.customerName?.trim() ?? "";
                const comandaLabel = `${t.comandaCount} comanda${t.comandaCount === 1 ? "" : "s"}`;
                return (
                  <li key={`table-${t.tableId}`}>
                    <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-zinc-100">
                            {t.tableName}
                            {customerTrim ? ` — ${customerTrim}` : ""}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-sky-500/50 bg-sky-600/25 px-2 py-0.5 text-xs font-bold text-sky-100">
                              Mesa
                            </span>
                            <span className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-200">
                              Abierta
                            </span>
                          </div>
                        </div>
                        <p className="text-sm font-bold tabular-nums text-rondaCream">
                          ${t.unpaidTotal.toFixed(2)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{comandaLabel}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Tiempo:{" "}
                        <span className="font-mono font-semibold text-zinc-300">
                          {formatElapsed(t.startedAt, nowMs)}
                        </span>
                      </p>
                      <Link
                        href="/cashier/tables"
                        className="mt-2 inline-flex h-8 items-center rounded-md border border-zinc-700 bg-zinc-900/70 px-3 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                      >
                        Ver mesa
                      </Link>
                    </div>
                  </li>
                );
              }

              const r = card.order;
              const expanded = selectedOrderId === r.id;
              const busy = busyId === r.id;
              const summary = itemSummaryLine(r.items);
              const nameTrim = r.customerName?.trim() ?? "";
              const headerLabel = nameTrim || `#${shortOrderCode(r.id)}`;
              const selectedCls = expanded
                ? "border border-zinc-700 border-l-4 border-l-amber-500 bg-zinc-800/85 pl-2"
                : "border border-zinc-800 bg-zinc-950/60";

              return (
                <li key={r.id}>
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelect(r.id)}
                      className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition hover:bg-zinc-800/40 ${selectedCls}`}
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
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Recibido:{" "}
                        <span className="font-semibold text-zinc-300">
                          {formatPlacedClock(r.created_at)}
                        </span>
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-zinc-400">
                        {summary || "Sin ítems"}
                      </p>
                    </button>
                    {!r.isLocal ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelTargetId(r.id);
                          setCancelReason("");
                        }}
                        className="shrink-0 rounded-md border border-red-800/70 bg-red-950/60 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-900/60 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>

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
                                ({sizeChoiceLabelEs(it.size)})
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
      {cancelTargetId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <h4 className="text-base font-bold text-zinc-100">
              ¿Cancelar este pedido?
            </h4>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Motivo (opcional)
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              placeholder="Ej: cliente cambió de opinión"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelTargetId(null);
                  setCancelReason("");
                }}
                className="h-10 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                No, mantener
              </button>
              <button
                type="button"
                onClick={() => void confirmCancelOrder()}
                className="h-10 rounded-lg border border-red-700 bg-red-700 px-3 text-sm font-bold text-white hover:bg-red-600"
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
