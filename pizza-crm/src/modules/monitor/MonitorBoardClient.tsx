"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";
import { sizeChoiceLabelEs } from "@/modules/menu/constants";
import { INCLUDED_IN_COMBO_NOTE, parseComboCustomizations } from "@/modules/orders/lib/comboItemMetadata";
import { originLabelEs } from "@/modules/orders/lib/orderOrigin";
import { shortOrderCode } from "@/modules/orders/lib/orderStatusWorkflow";

export type GreetingStatus = "given" | "not_given" | null;

type MonitorLine = {
  id: string;
  quantity: number;
  size: string;
  productName: string;
  customizations: string[];
  isComboComponent: boolean;
};

type MonitorOrder = {
  id: string;
  created_at: string;
  origin: string;
  total: number;
  greeting_status: GreetingStatus;
  tableName: string | null;
  items: MonitorLine[];
};

type FilterMode = "all" | "unmarked";

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function startOfTodayIso(): string {
  const ymd = toLocalYmd(new Date());
  return new Date(`${ymd}T00:00:00`).toISOString();
}

export default function MonitorBoardClient() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<MonitorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, [supabase]);

  const loadOrders = useCallback(async () => {
    setError(null);
    const since = startOfTodayIso();

    const { data: orderRows, error: oErr } = await supabase
      .from("orders")
      .select(
        `
        id,
        created_at,
        origin,
        total,
        greeting_status,
        table_id,
        tables ( name ),
        order_items (
          id,
          product_id,
          quantity,
          size,
          customizations,
          is_combo_component
        )
      `,
      )
      .gte("created_at", since)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    if (oErr) {
      setError(oErr.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    const raw = orderRows ?? [];
    const pids = new Set<string>();
    for (const o of raw) {
      for (const it of o.order_items ?? []) {
        pids.add(it.product_id as string);
      }
    }

    let nameMap = new Map<string, string>();
    if (pids.size > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id,name")
        .in("id", Array.from(pids));
      nameMap = new Map(
        (prods ?? []).map((p) => [p.id as string, p.name as string]),
      );
    }

    const mapped: MonitorOrder[] = raw.map((o) => {
      const tbl = o.tables as
        | { name: string }
        | { name: string }[]
        | null;
      const tableName = Array.isArray(tbl)
        ? tbl[0]?.name ?? null
        : tbl?.name ?? null;
      const items: MonitorLine[] = (o.order_items ?? []).map((it) => ({
        id: it.id as string,
        quantity: it.quantity as number,
        size: String(it.size),
        productName: nameMap.get(it.product_id as string) ?? "Producto",
        customizations: parseComboCustomizations(it.customizations).visible,
        isComboComponent: it.is_combo_component === true,
      }));
      return {
        id: o.id as string,
        created_at: o.created_at as string,
        origin: String(o.origin),
        total: Number(o.total) || 0,
        greeting_status: (o.greeting_status as GreetingStatus) ?? null,
        tableName,
        items,
      };
    });

    setOrders(mapped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const ch = supabase
      .channel("monitor-orders")
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
      void supabase.removeChannel(ch);
    };
  }, [supabase, loadOrders]);

  const summary = useMemo(() => {
    const total = orders.length;
    const given = orders.filter((o) => o.greeting_status === "given").length;
    const notGiven = orders.filter(
      (o) => o.greeting_status === "not_given",
    ).length;
    const unmarked = orders.filter((o) => o.greeting_status == null).length;
    return { total, given, notGiven, unmarked, marked: given + notGiven };
  }, [orders]);

  const visible = useMemo(() => {
    if (filter === "unmarked") {
      return orders.filter((o) => o.greeting_status == null);
    }
    return orders;
  }, [orders, filter]);

  async function markGreeting(orderId: string, status: GreetingStatus) {
    if (!userId) {
      setError("Sesión no lista. Recarga la página.");
      return;
    }
    setBusyId(orderId);
    setError(null);
    const payload =
      status == null
        ? {
            greeting_status: null,
            greeting_marked_at: null,
            greeting_marked_by: null,
          }
        : {
            greeting_status: status,
            greeting_marked_at: new Date().toISOString(),
            greeting_marked_by: userId,
          };

    const { error: uErr } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId);

    if (uErr) {
      setError(uErr.message);
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, greeting_status: status } : o,
        ),
      );
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-semibold text-zinc-200">
          Marcadas {summary.marked}/{summary.total} · ✅ {summary.given} · ❌{" "}
          {summary.notGiven} · Sin marcar {summary.unmarked}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={
              filter === "all"
                ? "h-10 flex-1 rounded-lg bg-rondaAccent text-sm font-bold text-rondaCream"
                : "h-10 flex-1 rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-300"
            }
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilter("unmarked")}
            className={
              filter === "unmarked"
                ? "h-10 flex-1 rounded-lg bg-rondaAccent text-sm font-bold text-rondaCream"
                : "h-10 flex-1 rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-300"
            }
          >
            Sin marcar
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-zinc-500">Cargando órdenes del día…</p>
      ) : visible.length === 0 ? (
        <p className="text-center text-zinc-500">
          {filter === "unmarked"
            ? "No hay órdenes sin marcar."
            : "Sin órdenes hoy."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((o) => {
            const border =
              o.greeting_status === "given"
                ? "border-emerald-600/70 bg-emerald-950/20"
                : o.greeting_status === "not_given"
                  ? "border-red-700/70 bg-red-950/20"
                  : "border-zinc-700 bg-zinc-900/40";
            const busy = busyId === o.id;
            return (
              <li
                key={o.id}
                className={`rounded-2xl border-2 p-4 ${border}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-black text-zinc-50">
                      {formatClock(o.created_at)}
                      <span className="ml-2 font-mono text-sm font-bold text-zinc-500">
                        #{shortOrderCode(o.id)}
                      </span>
                    </p>
                    <p className="text-sm text-zinc-400">
                      {originLabelEs(o.origin, o.tableName ? "x" : null, o.tableName)}
                      {o.tableName ? ` · ${o.tableName}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-black tabular-nums text-rondaCream">
                    ${o.total.toFixed(2)}
                  </p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-zinc-200">
                  {o.items.map((it) => (
                    <li key={it.id} className={it.isComboComponent ? "ml-4" : ""}>
                      {it.isComboComponent ? "└ " : ""}
                      {it.quantity}× {it.productName}
                      {!it.isComboComponent ? (
                        <span className="text-zinc-500">
                          {" "}
                          ({sizeChoiceLabelEs(it.size)})
                        </span>
                      ) : (
                        <span className="text-zinc-500">
                          {" "}
                          ({INCLUDED_IN_COMBO_NOTE})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markGreeting(o.id, "given")}
                    className="min-h-12 flex-1 rounded-xl bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    ✅ Dio el saludo
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markGreeting(o.id, "not_given")}
                    className="min-h-12 flex-1 rounded-xl bg-red-800 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    ❌ No lo dio
                  </button>
                  {o.greeting_status != null ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markGreeting(o.id, null)}
                      className="min-h-12 rounded-xl border border-zinc-600 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                    >
                      Sin marcar
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
