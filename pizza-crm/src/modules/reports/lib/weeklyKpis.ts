/**
 * Métricas clave del negocio por semana (Reportes → arriba de todo).
 * Ventas, ticket y food cost salen del mismo cálculo que el Estado de resultados
 * (loadIncomeStatement), para que los números cuadren entre pantallas.
 * Pizzas por día y margen por canal se calculan aquí.
 */
import type { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

import {
  SALES_CHANNELS,
  coverageWarning,
  loadIncomeStatement,
  type DateRange,
  type PeriodFigures,
  type SalesChannel,
} from "./incomeStatement";
import { ordersCreatedAtBounds } from "./reportDates";

type Supa = ReturnType<typeof createClient>;

const PAGE = 1000;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type ChannelMargin = { ventas: number; costo: number; margen: number | null };

export type WeekKpis = {
  range: DateRange;
  ventasNetas: number;
  ordenes: number;
  ticketPromedio: number;
  pizzas: number;
  diasConVenta: number;
  pizzasPorDia: number;
  /** Pizzas por fecha (YYYY-MM-DD) dentro de la semana. */
  pizzasPorFecha: Record<string, number>;
  /** Órdenes por fecha (YYYY-MM-DD) dentro de la semana. */
  ordenesPorFecha: Record<string, number>;
  /** Costo de venta / ventas netas (null si no hay ventas). */
  foodCostPct: number | null;
  costoVenta: number;
  canal: Record<SalesChannel, ChannelMargin>;
  /** Aviso si el costo de venta está incompleto (órdenes sin descontar, insumos en $0). */
  aviso: string | null;
};

export type WeeklyKpis = { cur: WeekKpis; prev: WeekKpis };

/* ---------- Semanas (lunes a domingo, hora local) ---------- */

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const dow = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - dow);
  return x;
}

/** Semana que empieza el lunes `monday` (desplazada `offset` semanas). */
export function weekRange(monday: Date, offset = 0): DateRange {
  const a = new Date(monday);
  a.setDate(a.getDate() + offset * 7);
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  return { from: toLocalYmd(a), to: toLocalYmd(b) };
}

/** Lunes de la última semana completa (la anterior a la actual). */
export function lastCompleteWeekMonday(today = new Date()): Date {
  const m = mondayOf(today);
  m.setDate(m.getDate() - 7);
  return m;
}

export function currentWeekMonday(today = new Date()): Date {
  return mondayOf(today);
}

/* ---------- Carga ---------- */

async function pageAll<T>(
  q: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let s = 0; ; s += PAGE) {
    const { data, error } = await q(s, s + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

type OrderRow = { id: string; created_at: string; origin: string };
type ItemRow = {
  order_id: string;
  quantity: number | string;
  is_combo_component: boolean | null;
  products: { category: string | null; is_combo: boolean | null } | { category: string | null; is_combo: boolean | null }[] | null;
};
type MovRow = {
  ref_type: string | null;
  ref_id: string | null;
  qty_base: number | string;
  unit_cost_base: number | string | null;
  inventory_items: { accounting_category: string | null } | { accounting_category: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Pizzas vendidas, días con venta y costo de inventario por canal. */
async function loadExtras(supabase: Supa, range: DateRange) {
  const { startIso, endIso } = ordersCreatedAtBounds(range.from, range.to);
  const [orders, movs] = await Promise.all([
    pageAll<OrderRow>((a, b) =>
      supabase
        .from("orders")
        .select("id, created_at, origin")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .neq("status", "cancelled")
        .order("id", { ascending: true })
        .range(a, b),
    ),
    pageAll<MovRow>((a, b) =>
      supabase
        .from("inventory_movements")
        .select("ref_type, ref_id, qty_base, unit_cost_base, inventory_items(accounting_category)")
        .in("type", ["consumption", "waste"])
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("id", { ascending: true })
        .range(a, b),
    ),
  ]);

  const channelOf = new Map<string, SalesChannel>();
  const days = new Set<string>();
  const dayOf = new Map<string, string>();
  const ordenesPorFecha: Record<string, number> = {};
  for (const o of orders) {
    channelOf.set(o.id, o.origin === "delivery_app" ? "Plataformas" : "Restaurante");
    const d = toLocalYmd(new Date(o.created_at));
    days.add(d);
    dayOf.set(o.id, d);
    ordenesPorFecha[d] = (ordenesPorFecha[d] ?? 0) + 1;
  }
  const pizzasPorFecha: Record<string, number> = {};

  // Pizzas: categoría con "pizza", sin contar el renglón padre de un combo (sí sus componentes).
  let pizzas = 0;
  const ids = orders.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const items = await pageAll<ItemRow>((a, b) =>
      supabase
        .from("order_items")
        .select("order_id, quantity, is_combo_component, products(category, is_combo)")
        .in("order_id", slice)
        .order("id", { ascending: true })
        .range(a, b),
    );
    for (const it of items) {
      const p = one(it.products);
      if (p?.is_combo && it.is_combo_component !== true) continue;
      if (/pizza/i.test(p?.category ?? "")) {
        const q = num(it.quantity);
        pizzas += q;
        const d = dayOf.get(it.order_id);
        if (d) pizzasPorFecha[d] = (pizzasPorFecha[d] ?? 0) + q;
      }
    }
  }

  // Costo de inventario (rubro Costo de venta) por canal.
  const costo: Record<SalesChannel, number> = { Restaurante: 0, Plataformas: 0, Mayoreo: 0 };
  for (const m of movs) {
    const item = one(m.inventory_items);
    if (item?.accounting_category === "Gasto de operación") continue;
    const c = -num(m.qty_base) * num(m.unit_cost_base);
    if (m.ref_type === "wholesale") costo.Mayoreo += c;
    else if (m.ref_type === "order" && m.ref_id && channelOf.has(m.ref_id)) costo[channelOf.get(m.ref_id)!] += c;
  }

  return { pizzas, diasConVenta: days.size, costo, pizzasPorFecha, ordenesPorFecha };
}

function build(range: DateRange, f: PeriodFigures, x: Awaited<ReturnType<typeof loadExtras>>): WeekKpis {
  const canal = Object.fromEntries(
    SALES_CHANNELS.map((ch) => {
      const ventas = f.ventas[ch];
      const costo = Math.round(x.costo[ch] * 100) / 100;
      return [ch, { ventas, costo, margen: ventas > 0 ? (ventas - costo) / ventas : null }];
    }),
  ) as Record<SalesChannel, ChannelMargin>;
  return {
    range,
    ventasNetas: f.ventasTotal,
    ordenes: f.ordenes,
    ticketPromedio: f.ticketPromedio,
    pizzas: x.pizzas,
    diasConVenta: x.diasConVenta,
    pizzasPorDia: x.diasConVenta > 0 ? x.pizzas / x.diasConVenta : 0,
    pizzasPorFecha: x.pizzasPorFecha,
    ordenesPorFecha: x.ordenesPorFecha,
    foodCostPct: f.ventasTotal > 0 ? f.costoVenta / f.ventasTotal : null,
    costoVenta: f.costoVenta,
    canal,
    aviso: coverageWarning(f.coverage),
  };
}

export async function loadWeeklyKpis(supabase: Supa, cur: DateRange, prev: DateRange): Promise<WeeklyKpis> {
  const [is, xc, xp] = await Promise.all([
    loadIncomeStatement(supabase, cur, prev),
    loadExtras(supabase, cur),
    loadExtras(supabase, prev),
  ]);
  return { cur: build(cur, is.cur, xc), prev: build(prev, is.prev, xp) };
}
