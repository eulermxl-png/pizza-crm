"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

import {
  exportBestSellersExcel,
  exportHeatmapExcel,
  exportRevenueExpensesExcel,
} from "./lib/exportReports";
import {
  dayIndexMonSun,
  eachLocalDayInclusive,
  HEATMAP_HOURS,
  ordersCreatedAtBounds,
  WEEKDAY_LABELS_MON_FIRST,
} from "./lib/reportDates";

type OrderRow = { id: string; total: number | string; created_at: string };
type ItemRow = {
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
};
type ExpenseRowDb = { date: string; amount: number | string };
type ProductMeta = { id: string; name: string; category: string };

const CHUNK = 400;

async function fetchOrderItemsInChunks(
  supabase: ReturnType<typeof createClient>,
  orderIds: string[],
): Promise<ItemRow[]> {
  const out: ItemRow[] = [];
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const slice = orderIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, product_id, quantity, unit_price")
      .in("order_id", slice);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as ItemRow[]));
  }
  return out;
}

function fmtShortYmd(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function rangeFileLabel(fromYmd: string, toYmd: string): string {
  return `${fromYmd}_a_${toYmd}`.replace(/[^\d\-_a-z]+/gi, "_");
}

export default function ReportsDashboardClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const [from, setFrom] = useState(() => {
    const n = new Date();
    return toLocalYmd(new Date(n.getFullYear(), n.getMonth(), 1));
  });
  const [to, setTo] = useState(today);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRowDb[]>([]);
  const [productMap, setProductMap] = useState<Map<string, ProductMeta>>(
    new Map(),
  );

  const bounds = useMemo(() => ordersCreatedAtBounds(from, to), [from, to]);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const { startIso, endIso, fromYmd, toYmd } = ordersCreatedAtBounds(
        from,
        to,
      );

      const { data: orderRows, error: oErr } = await supabase
        .from("orders")
        .select("id, total, created_at")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true });

      if (oErr) throw new Error(oErr.message);

      const ords = (orderRows ?? []) as OrderRow[];
      const ids = ords.map((o) => o.id);
      let itemRows: ItemRow[] = [];
      if (ids.length > 0) {
        itemRows = await fetchOrderItemsInChunks(supabase, ids);
      }

      const { data: expRows, error: eErr } = await supabase
        .from("expenses")
        .select("date, amount")
        .gte("date", fromYmd)
        .lte("date", toYmd);

      if (eErr) throw new Error(eErr.message);

      const productIds = Array.from(
        new Set(itemRows.map((i) => i.product_id)),
      );
      let pmap = new Map<string, ProductMeta>();
      if (productIds.length > 0) {
        const { data: prods, error: pErr } = await supabase
          .from("products")
          .select("id, name, category")
          .in("id", productIds);
        if (pErr) throw new Error(pErr.message);
        pmap = new Map(
          (prods ?? []).map((p) => [
            p.id,
            { id: p.id, name: p.name, category: p.category },
          ]),
        );
      }

      setOrders(ords);
      setItems(itemRows);
      setExpenses((expRows ?? []) as ExpenseRowDb[]);
      setProductMap(pmap);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar datos.");
      setOrders([]);
      setItems([]);
      setExpenses([]);
      setProductMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [supabase, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const bestSellers = useMemo(() => {
    const acc = new Map<string, { qty: number; revenue: number }>();
    for (const it of items) {
      const cur = acc.get(it.product_id) ?? { qty: 0, revenue: 0 };
      const q = it.quantity;
      const price = Number(it.unit_price);
      cur.qty += q;
      cur.revenue += q * price;
      acc.set(it.product_id, cur);
    }
    return Array.from(acc.entries())
      .map(([productId, v]) => {
        const p = productMap.get(productId);
        return {
          productId,
          name: p?.name ?? "Producto",
          category: p?.category ?? "—",
          units: v.qty,
          revenue: Math.round(v.revenue * 100) / 100,
        };
      })
      .sort((a, b) => b.units - a.units);
  }, [items, productMap]);

  const salesByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      const key = toLocalYmd(new Date(o.created_at));
      const t = Number(o.total);
      m.set(key, (m.get(key) ?? 0) + t);
    }
    return m;
  }, [orders]);

  const expensesByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) {
      const k = e.date.slice(0, 10);
      const a = Number(e.amount);
      m.set(k, (m.get(k) ?? 0) + a);
    }
    return m;
  }, [expenses]);

  const dailyPnL = useMemo(() => {
    const days = eachLocalDayInclusive(bounds.fromYmd, bounds.toYmd);
    return days.map((ymd) => {
      const ventas = Math.round((salesByDay.get(ymd) ?? 0) * 100) / 100;
      const gastos = Math.round((expensesByDay.get(ymd) ?? 0) * 100) / 100;
      const neto = Math.round((ventas - gastos) * 100) / 100;
      return {
        ymd,
        fecha: fmtShortYmd(ymd),
        ventas,
        gastos,
        neto,
      };
    });
  }, [bounds.fromYmd, bounds.toYmd, salesByDay, expensesByDay]);

  const chartData = useMemo(
    () =>
      dailyPnL.map((d) => ({
        fecha: d.fecha,
        ventas: d.ventas,
        gastos: d.gastos,
      })),
    [dailyPnL],
  );

  const totals = useMemo(() => {
    const ventas = orders.reduce((s, o) => s + Number(o.total), 0);
    const gastos = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return {
      ventas: Math.round(ventas * 100) / 100,
      gastos: Math.round(gastos * 100) / 100,
      neto: Math.round((ventas - gastos) * 100) / 100,
    };
  }, [orders, expenses]);

  const heatmapGrid = useMemo(() => {
    const grid: number[][] = HEATMAP_HOURS.map(() =>
      Array<number>(7).fill(0),
    );
    for (const o of orders) {
      const d = new Date(o.created_at);
      const h = d.getHours();
      if (h < 6 || h > 23) continue;
      const row = h - 6;
      const col = dayIndexMonSun(d);
      const rowData = grid[row];
      if (rowData) rowData[col] = (rowData[col] ?? 0) + 1;
    }
    return grid;
  }, [orders]);

  const heatmapMax = useMemo(
    () => Math.max(1, ...heatmapGrid.flat()),
    [heatmapGrid],
  );

  const fileTag = rangeFileLabel(bounds.fromYmd, bounds.toYmd);

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Rango de fechas (todos los reportes)
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
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
        </div>
      </section>

      {loadError ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-zinc-500">Cargando reportes…</p>
      ) : null}

      {/* 1. Best sellers */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold text-zinc-50">
            Productos más vendidos
          </h3>
          <button
            type="button"
            disabled={bestSellers.length === 0}
            onClick={() =>
              exportBestSellersExcel(
                bestSellers.map((r) => ({
                  name: r.name,
                  category: r.category,
                  units: r.units,
                  revenue: r.revenue,
                })),
                fileTag,
              )
            }
            className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
          >
            Exportar Excel
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Ranking por unidades vendidas en el período ({bounds.fromYmd} —{" "}
          {bounds.toYmd})
        </p>
        {bestSellers.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin ventas en este rango.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm text-zinc-200">
              <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2 text-right">Unidades</th>
                  <th className="px-3 py-2 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {bestSellers.map((r, i) => (
                  <tr
                    key={r.productId}
                    className="border-b border-zinc-800/60 hover:bg-zinc-900/50"
                  >
                    <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-zinc-100">
                      {r.name}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.units}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-300">
                      ${r.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Revenue vs expenses */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold text-zinc-50">
            Ventas vs gastos
          </h3>
          <button
            type="button"
            onClick={() =>
              exportRevenueExpensesExcel(
                dailyPnL.map((d) => ({
                  fecha: d.ymd,
                  ventas: d.ventas,
                  gastos: d.gastos,
                  neto: d.neto,
                })),
                totals,
                fileTag,
              )
            }
            className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Exportar Excel
          </button>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs uppercase text-zinc-500">Ventas totales</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-orange-400">
              ${totals.ventas.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs uppercase text-zinc-500">Gastos totales</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-sky-400">
              ${totals.gastos.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs uppercase text-zinc-500">Utilidad neta</p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${
                totals.neto >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              ${totals.neto.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="h-[360px] w-full min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="fecha" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#e4e4e7" }}
                formatter={(value: unknown) => {
                  const n = Number(value);
                  const safe = Number.isFinite(n) ? n : 0;
                  return [`$${safe.toFixed(2)}`, ""];
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 12 }}
                formatter={(value) =>
                  value === "ventas"
                    ? "Ventas ($)"
                    : value === "gastos"
                      ? "Gastos ($)"
                      : value
                }
              />
              <Bar dataKey="ventas" name="ventas" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" name="gastos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 3. Peak hours */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold text-zinc-50">
            Horas pico (pedidos por hora y día)
          </h3>
          <button
            type="button"
            onClick={() =>
              exportHeatmapExcel(
                heatmapGrid,
                fileTag,
                WEEKDAY_LABELS_MON_FIRST,
                HEATMAP_HOURS,
              )
            }
            className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Exportar Excel
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Cada celda cuenta pedidos creados entre 6:00 y 23:59 (hora local). Más
          oscuro = más pedidos. Máximo en período: {heatmapMax} pedidos/celda.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-center text-xs text-zinc-200">
            <thead>
              <tr>
                <th className="border border-zinc-800 bg-zinc-900/80 px-2 py-2 text-zinc-500">
                  Hora
                </th>
                {WEEKDAY_LABELS_MON_FIRST.map((d) => (
                  <th
                    key={d}
                    className="border border-zinc-800 bg-zinc-900/80 px-2 py-2 font-semibold text-zinc-400"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HEATMAP_HOURS.map((h, rowIdx) => (
                <tr key={h}>
                  <td className="border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-zinc-500">
                    {String(h).padStart(2, "0")}:00
                  </td>
                  {WEEKDAY_LABELS_MON_FIRST.map((_, colIdx) => {
                    const v = heatmapGrid[rowIdx]?.[colIdx] ?? 0;
                    const intensity = v / heatmapMax;
                    const bg = `rgba(249, 115, 22, ${0.08 + intensity * 0.85})`;
                    return (
                      <td
                        key={colIdx}
                        className="border border-zinc-800 px-1 py-1.5 font-semibold tabular-nums"
                        style={{ backgroundColor: bg }}
                        title={`${v} pedidos`}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
