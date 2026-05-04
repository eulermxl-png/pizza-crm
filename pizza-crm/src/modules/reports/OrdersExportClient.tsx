"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

import { exportOrdersExcel } from "./lib/exportReports";
import {
  buildOrdersExportRows,
  type DbItemExport,
  type DbOrderExport,
} from "./lib/formatOrdersForExport";
import { ordersCreatedAtBounds } from "./lib/reportDates";

const CHUNK = 400;
const PAGE = 1000;

async function fetchOrdersInRange(
  supabase: ReturnType<typeof createClient>,
  startIso: string,
  endIso: string,
): Promise<DbOrderExport[]> {
  const out: DbOrderExport[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, customer_name, origin, status, payment_method, discount, total, cash_amount, card_amount, table_id",
      )
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as DbOrderExport[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function fetchOrderItemsInChunks(
  supabase: ReturnType<typeof createClient>,
  orderIds: string[],
): Promise<DbItemExport[]> {
  const out: DbItemExport[] = [];
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const slice = orderIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, product_id, size, quantity, unit_price, customizations")
      .in("order_id", slice);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as DbItemExport[]));
  }
  return out;
}

export default function OrdersExportClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const [from, setFrom] = useState(() => {
    const n = new Date();
    return toLocalYmd(new Date(n.getFullYear(), n.getMonth(), 1));
  });
  const [to, setTo] = useState(today);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orders, setOrders] = useState<DbOrderExport[]>([]);
  const [items, setItems] = useState<DbItemExport[]>([]);
  const [productMap, setProductMap] = useState<Map<string, string>>(new Map());
  const [tableMap, setTableMap] = useState<Map<string, string>>(new Map());

  const bounds = useMemo(() => ordersCreatedAtBounds(from, to), [from, to]);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const { startIso, endIso } = bounds;

      const { data: tblRows, error: tErr } = await supabase
        .from("tables")
        .select("id, name");
      if (tErr) throw new Error(tErr.message);
      const tmap = new Map<string, string>(
        (tblRows ?? []).map((r) => [r.id as string, r.name as string]),
      );
      setTableMap(tmap);

      const ords = await fetchOrdersInRange(supabase, startIso, endIso);
      const ids = ords.map((o) => o.id);
      let itemRows: DbItemExport[] = [];
      if (ids.length > 0) {
        itemRows = await fetchOrderItemsInChunks(supabase, ids);
      }

      const productIds = Array.from(new Set(itemRows.map((i) => i.product_id)));
      let pmap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: prods, error: pErr } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds);
        if (pErr) throw new Error(pErr.message);
        pmap = new Map(
          (prods ?? []).map((p) => [p.id as string, p.name as string]),
        );
      }

      setOrders(ords);
      setItems(itemRows);
      setProductMap(pmap);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar datos.");
      setOrders([]);
      setItems([]);
      setProductMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [supabase, bounds]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleExportExcel() {
    const { summary, detail } = buildOrdersExportRows(
      orders,
      items,
      productMap,
      tableMap,
    );
    exportOrdersExcel(summary, detail, bounds.fromYmd, bounds.toYmd);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="text-lg font-bold text-zinc-50">Exportar órdenes</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Descarga un Excel con el resumen por orden y una hoja de detalle por
          ítem. Usa el mismo rango de fechas que en reportes.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Desde</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Hasta</label>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-11 rounded-lg border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || orders.length === 0}
            className="h-11 rounded-lg border border-zinc-600 bg-zinc-800 px-4 text-sm font-semibold text-zinc-50 hover:bg-zinc-700 disabled:opacity-40"
          >
            Exportar a Excel
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Archivo:{" "}
          <span className="font-mono text-zinc-400">
            ordenes_{bounds.fromYmd}_a_{bounds.toYmd}.xlsx
          </span>
        </p>
      </section>

      {loadError ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-zinc-500">Cargando órdenes…</p>
      ) : (
        <p className="text-sm text-zinc-400">
          {orders.length === 0
            ? "No hay órdenes en este rango."
            : `${orders.length} orden${orders.length === 1 ? "" : "es"} listas para exportar (${items.length} líneas).`}
        </p>
      )}
    </div>
  );
}
