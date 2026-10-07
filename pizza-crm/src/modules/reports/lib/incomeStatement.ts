import type { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";
import { ordersCreatedAtBounds } from "./reportDates";

type Supa = ReturnType<typeof createClient>;

export type PeriodKey = "Actual" | "Anterior";
export type SalesChannel = "Restaurante" | "Plataformas" | "Mayoreo";
export type ExpenseGroup =
  | "Costo de venta"
  | "Gasto de operación"
  | "Compra de inventario";
export type ExpenseOrigin = "Manual" | "Compra de inventario";

/** Renglón de gastos de operación que sale del consumo de inventario (empaques, gas…). */
export const INVENTORY_OPEX_LINE = "Empaque y consumibles (inventario)";

export const SALES_CHANNELS: SalesChannel[] = [
  "Restaurante",
  "Plataformas",
  "Mayoreo",
];

/** Categorías de gasto que suman al costo de venta (Insumos = etiqueta operativa). */
export const COGS_CATEGORIES = ["Costo de venta", "Insumos"] as const;

/** Orden fijo para gastos de operación; categorías desconocidas van al final. */
const OPEX_ORDER = [
  "Renta",
  "Nómina",
  "Servicios",
  "Mantenimiento",
  "Gasto de operación",
  "Otros",
];

export type SaleLine = {
  fecha: string;
  canal: SalesChannel;
  referencia: string;
  total: number;
  propina: number;
  periodo: PeriodKey;
};

export type ExpenseLine = {
  fecha: string;
  categoria: string;
  origen: ExpenseOrigin;
  rubro: ExpenseGroup;
  descripcion: string;
  monto: number;
  periodo: PeriodKey;
};

/** Consumo de inventario agregado por insumo y tipo. */
export type ConsumptionLine = {
  insumo: string;
  tipo: "Consumo" | "Merma";
  rubro: "Costo de venta" | "Gasto de operación";
  cantidad: number;
  unidad: string;
  costo: number;
  periodo: PeriodKey;
};

export type Coverage = {
  ordenesEntregadas: number;
  ordenesConConsumo: number;
  /** Insumos que se consumieron con costo $0 (falta registrar su costo). */
  insumosSinCosto: string[];
};

export type DateRange = { from: string; to: string };

export type PeriodFigures = {
  ventas: Record<SalesChannel, number>;
  ventasTotal: number;
  /** Consumo de insumos (inventario) con rubro Costo de venta */
  costoConsumo: number;
  /** Merma registrada en inventario con rubro Costo de venta */
  costoMerma: number;
  /** Gastos capturados a mano como Insumos / Costo de venta (sin pasar por inventario) */
  costoManual: number;
  costoVenta: number;
  utilidadBruta: number;
  opex: Record<string, number>;
  opexTotal: number;
  utilidadOperacion: number;
  ordenes: number;
  ticketPromedio: number;
  propinas: number;
  margenBruto: number;
  margenOperativo: number;
  mayorGasto: ExpenseLine | null;
  /** Compras de inventario del periodo: informativo, no suman al resultado. */
  comprasInventario: number;
  coverage: Coverage;
};

export type IncomeStatement = {
  actual: DateRange;
  anterior: DateRange;
  opexCategories: string[];
  cur: PeriodFigures;
  prev: PeriodFigures;
  sales: SaleLine[];
  expenses: ExpenseLine[];
  consumption: ConsumptionLine[];
};

const PAGE = 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isCogsCategory(category: string): boolean {
  return (COGS_CATEGORIES as readonly string[]).includes(category.trim());
}

/* ---------- Periodo de comparación ---------- */

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function lastDayOfMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

/**
 * Si el rango arranca el día 1 → mismos días del mes anterior
 * (mes completo si el rango llega a fin de mes).
 * Si no → mismo número de días inmediatamente antes.
 */
export function previousComparableRange(range: DateRange): DateRange {
  const a = parseYmd(range.from);
  const b = parseYmd(range.to);
  if (a.getDate() === 1) {
    const py = a.getMonth() === 0 ? a.getFullYear() - 1 : a.getFullYear();
    const pm = a.getMonth() === 0 ? 11 : a.getMonth() - 1;
    const sameMonth =
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    if (sameMonth) {
      const isMonthEnd =
        b.getDate() === lastDayOfMonth(b.getFullYear(), b.getMonth());
      const prevLast = lastDayOfMonth(py, pm);
      const endDay = isMonthEnd ? prevLast : Math.min(b.getDate(), prevLast);
      return {
        from: toLocalYmd(new Date(py, pm, 1)),
        to: toLocalYmd(new Date(py, pm, endDay)),
      };
    }
  }
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(a);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: toLocalYmd(prevFrom), to: toLocalYmd(prevTo) };
}

/* ---------- Carga paginada ---------- */

async function fetchAllPages<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await query(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

type OrderDb = {
  id: string;
  created_at: string;
  origin: string;
  platform: string | null;
  status: string;
  total: number | string;
  tip: number | string | null;
};

type WholesaleDb = {
  id: string;
  sold_at: string;
  total: number | string;
  merma: boolean | null;
  wholesale_clients: { name: string } | { name: string }[] | null;
};

type ExpenseDb = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number | string;
};

type MovementDb = {
  type: string;
  qty_base: number | string;
  unit_cost_base: number | string;
  ref_type: string | null;
  ref_id: string | null;
  inventory_items:
    | { name: string; base_unit: string | null; accounting_category: string | null }
    | { name: string; base_unit: string | null; accounting_category: string | null }[]
    | null;
};

type PeriodRaw = {
  sales: SaleLine[];
  expenses: ExpenseLine[];
  consumption: ConsumptionLine[];
  coverage: Coverage;
};

const ID_CHUNK = 200;

async function purchaseLinkedExpenseIds(
  supabase: Supa,
  expenseIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < expenseIds.length; i += ID_CHUNK) {
    const slice = expenseIds.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from("inventory_purchases")
      .select("expense_id")
      .in("expense_id", slice);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { expense_id: string | null }[]) {
      if (r.expense_id) out.add(r.expense_id);
    }
  }
  return out;
}

async function loadPeriod(
  supabase: Supa,
  range: DateRange,
  periodo: PeriodKey,
): Promise<PeriodRaw> {
  const { startIso, endIso, fromYmd, toYmd } = ordersCreatedAtBounds(
    range.from,
    range.to,
  );

  const [orders, wholesale, expenses, movements] = await Promise.all([
    fetchAllPages<OrderDb>((a, b) =>
      supabase
        .from("orders")
        .select("id, created_at, origin, platform, status, total, tip")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b),
    ),
    fetchAllPages<WholesaleDb>((a, b) =>
      supabase
        .from("wholesale_sales")
        .select("id, sold_at, total, merma, wholesale_clients(name)")
        .gte("sold_at", fromYmd)
        .lte("sold_at", toYmd)
        .order("sold_at", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b),
    ),
    fetchAllPages<ExpenseDb>((a, b) =>
      supabase
        .from("expenses")
        .select("id, date, category, description, amount")
        .gte("date", fromYmd)
        .lte("date", toYmd)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b),
    ),
    fetchAllPages<MovementDb>((a, b) =>
      supabase
        .from("inventory_movements")
        .select(
          "type, qty_base, unit_cost_base, ref_type, ref_id, inventory_items(name, base_unit, accounting_category)",
        )
        .in("type", ["consumption", "waste"])
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b),
    ),
  ]);

  /* Ventas */
  const sales: SaleLine[] = [];
  let ordenesEntregadas = 0;
  const deliveredIds = new Set<string>();
  for (const o of orders) {
    const isPlatform = o.origin === "delivery_app";
    const plat = o.platform ? ` ${o.platform.toUpperCase()}` : "";
    if (o.status === "delivered") {
      ordenesEntregadas += 1;
      deliveredIds.add(o.id);
    }
    sales.push({
      fecha: toLocalYmd(new Date(o.created_at)),
      canal: isPlatform ? "Plataformas" : "Restaurante",
      referencia: `Orden ${o.id.slice(0, 8)}${isPlatform ? plat : ""}`,
      total: r2(num(o.total)),
      propina: r2(num(o.tip)),
      periodo,
    });
  }
  for (const w of wholesale) {
    if (w.merma) continue; // devuelto/perdido: no es venta
    const client = Array.isArray(w.wholesale_clients)
      ? w.wholesale_clients[0]?.name
      : w.wholesale_clients?.name;
    sales.push({
      fecha: w.sold_at,
      canal: "Mayoreo",
      referencia: `Mayoreo ${client ?? w.id.slice(0, 8)}`,
      total: r2(num(w.total)),
      propina: 0,
      periodo,
    });
  }

  /* Gastos: las compras de inventario no suman (ya se reflejan al consumirse) */
  const linked = await purchaseLinkedExpenseIds(
    supabase,
    expenses.map((e) => e.id),
  );
  const exp: ExpenseLine[] = expenses.map((e) => {
    const categoria = (e.category ?? "").trim() || "Otros";
    const fromPurchase = linked.has(e.id);
    return {
      fecha: e.date,
      categoria,
      origen: fromPurchase ? "Compra de inventario" : "Manual",
      rubro: fromPurchase
        ? "Compra de inventario"
        : isCogsCategory(categoria)
          ? "Costo de venta"
          : "Gasto de operación",
      descripcion: e.description ?? "",
      monto: r2(num(e.amount)),
      periodo,
    };
  });

  /* Consumo de inventario agregado por insumo */
  const agg = new Map<string, ConsumptionLine>();
  const zeroCost = new Set<string>();
  const ordersWithConsumption = new Set<string>();
  for (const m of movements) {
    const item = Array.isArray(m.inventory_items)
      ? m.inventory_items[0]
      : m.inventory_items;
    const insumo = item?.name ?? "Insumo sin nombre";
    const rubro =
      item?.accounting_category === "Gasto de operación"
        ? "Gasto de operación"
        : "Costo de venta";
    const tipo = m.type === "waste" ? "Merma" : "Consumo";
    const qty = -num(m.qty_base); // salida = cantidad positiva
    const cost = qty * num(m.unit_cost_base);
    if (num(m.unit_cost_base) === 0 && qty !== 0) zeroCost.add(insumo);
    if (m.ref_type === "order" && m.ref_id && deliveredIds.has(m.ref_id)) {
      ordersWithConsumption.add(m.ref_id);
    }
    const key = `${insumo}|${tipo}|${rubro}`;
    const cur = agg.get(key) ?? {
      insumo,
      tipo,
      rubro,
      cantidad: 0,
      unidad: item?.base_unit ?? "",
      costo: 0,
      periodo,
    };
    cur.cantidad += qty;
    cur.costo += cost;
    agg.set(key, cur);
  }
  const consumption = Array.from(agg.values())
    .map((c) => ({ ...c, cantidad: r2(c.cantidad), costo: r2(c.costo) }))
    .sort((a, b) => b.costo - a.costo);

  return {
    sales,
    expenses: exp,
    consumption,
    coverage: {
      ordenesEntregadas,
      ordenesConConsumo: ordersWithConsumption.size,
      insumosSinCosto: Array.from(zeroCost).sort(),
    },
  };
}

/* ---------- Cálculo ---------- */

function figures(raw: PeriodRaw, opexCategories: string[]): PeriodFigures {
  const { sales, expenses, consumption, coverage } = raw;
  const ventas: Record<SalesChannel, number> = {
    Restaurante: 0,
    Plataformas: 0,
    Mayoreo: 0,
  };
  let propinas = 0;
  let ordenes = 0;
  for (const s of sales) {
    ventas[s.canal] += s.total - s.propina;
    propinas += s.propina;
    if (s.canal !== "Mayoreo") ordenes += 1;
  }
  const ventasTotal = ventas.Restaurante + ventas.Plataformas + ventas.Mayoreo;

  let costoConsumo = 0;
  let costoMerma = 0;
  const opex: Record<string, number> = Object.fromEntries(
    opexCategories.map((c) => [c, 0]),
  );
  for (const c of consumption) {
    if (c.rubro === "Costo de venta") {
      if (c.tipo === "Merma") costoMerma += c.costo;
      else costoConsumo += c.costo;
    } else {
      opex[INVENTORY_OPEX_LINE] = (opex[INVENTORY_OPEX_LINE] ?? 0) + c.costo;
    }
  }

  let costoManual = 0;
  let comprasInventario = 0;
  let mayorGasto: ExpenseLine | null = null;
  for (const e of expenses) {
    if (e.rubro === "Compra de inventario") {
      comprasInventario += e.monto;
      continue;
    }
    if (e.rubro === "Costo de venta") costoManual += e.monto;
    else opex[e.categoria] = (opex[e.categoria] ?? 0) + e.monto;
    if (!mayorGasto || e.monto > mayorGasto.monto) mayorGasto = e;
  }
  const costoVenta = costoConsumo + costoMerma + costoManual;
  const opexTotal = Object.values(opex).reduce((s, v) => s + v, 0);
  const utilidadBruta = ventasTotal - costoVenta;
  const utilidadOperacion = utilidadBruta - opexTotal;
  const counterSales = ventas.Restaurante + ventas.Plataformas;

  for (const k of SALES_CHANNELS) ventas[k] = r2(ventas[k]);
  for (const k of Object.keys(opex)) opex[k] = r2(opex[k]);

  return {
    ventas,
    ventasTotal: r2(ventasTotal),
    costoConsumo: r2(costoConsumo),
    costoMerma: r2(costoMerma),
    costoManual: r2(costoManual),
    costoVenta: r2(costoVenta),
    utilidadBruta: r2(utilidadBruta),
    opex,
    opexTotal: r2(opexTotal),
    utilidadOperacion: r2(utilidadOperacion),
    ordenes,
    ticketPromedio: ordenes > 0 ? r2(counterSales / ordenes) : 0,
    propinas: r2(propinas),
    margenBruto: ventasTotal > 0 ? utilidadBruta / ventasTotal : 0,
    margenOperativo: ventasTotal > 0 ? utilidadOperacion / ventasTotal : 0,
    mayorGasto,
    comprasInventario: r2(comprasInventario),
    coverage,
  };
}

export async function loadIncomeStatement(
  supabase: Supa,
  actual: DateRange,
): Promise<IncomeStatement> {
  const anterior = previousComparableRange(actual);
  const [cur, prev] = await Promise.all([
    loadPeriod(supabase, actual, "Actual"),
    loadPeriod(supabase, anterior, "Anterior"),
  ]);

  const found = new Set<string>();
  for (const e of [...cur.expenses, ...prev.expenses]) {
    if (e.rubro === "Gasto de operación") found.add(e.categoria);
  }
  const base = [INVENTORY_OPEX_LINE, ...OPEX_ORDER];
  const opexCategories = [
    ...base,
    ...Array.from(found)
      .filter((c) => !base.includes(c))
      .sort(),
  ];

  return {
    actual,
    anterior,
    opexCategories,
    cur: figures(cur, opexCategories),
    prev: figures(prev, opexCategories),
    sales: [...cur.sales, ...prev.sales],
    expenses: [...cur.expenses, ...prev.expenses],
    consumption: [...cur.consumption, ...prev.consumption],
  };
}

/** Cobertura como texto corto para avisos. Null si todo está completo. */
export function coverageWarning(c: Coverage): string | null {
  const parts: string[] = [];
  if (c.ordenesEntregadas > 0 && c.ordenesConConsumo < c.ordenesEntregadas) {
    parts.push(
      `${c.ordenesConConsumo} de ${c.ordenesEntregadas} órdenes entregadas descontaron inventario`,
    );
  }
  if (c.insumosSinCosto.length > 0) {
    parts.push(
      `${c.insumosSinCosto.length} insumo${c.insumosSinCosto.length === 1 ? "" : "s"} sin costo (${c.insumosSinCosto.join(", ")})`,
    );
  }
  return parts.length ? parts.join(" · ") : null;
}
