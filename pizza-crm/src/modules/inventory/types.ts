export type InventoryLevel = "suficiente" | "mitad" | "poco" | "agotado";

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  sort_order: number;
  active: boolean;
  // Campos de la Fase 1 (migración 0026). Opcionales para no romper el checklist de cocina.
  base_unit?: string | null;
  min_stock?: number;
  current_cost?: number;
  current_stock?: number;
  yield_pct?: number;
  count_tolerance_pct?: number;
  accounting_category?: string;
  pack_size?: number | null;
};

export type InventoryReport = {
  id: string;
  created_at: string;
  created_by: string | null;
  notes: string | null;
  creator_name?: string | null;
};

export type InventoryReportItem = {
  id: string;
  report_id: string;
  item_id: string;
  level: InventoryLevel;
  quantity_text: string | null;
  item_name?: string;
  item_category?: string;
  item_sort_order?: number;
};

export const INVENTORY_LEVELS: {
  value: InventoryLevel;
  label: string;
  emoji: string;
}[] = [
  { value: "suficiente", label: "Suficiente", emoji: "🟢" },
  { value: "mitad", label: "Mitad", emoji: "🟡" },
  { value: "poco", label: "Poco", emoji: "🟠" },
  { value: "agotado", label: "Se acabó", emoji: "🔴" },
];

export const INVENTORY_CATEGORIES = [
  "Básicos",
  "Carnes",
  "Quesos y lácteos",
  "Frutas y verduras",
  "Salsas y aderezos",
  "Empaque y desechables",
  "Otros",
] as const;

// ---------------------------------------------------------------------------
// Unidades (espejo del seed de la tabla public.units en la migración 0026)
// ---------------------------------------------------------------------------
export type UnitFamily = "peso" | "volumen" | "pieza";

export type Unit = {
  code: string;
  name: string;
  family: UnitFamily;
  to_base_factor: number;
};

export const UNITS: Unit[] = [
  { code: "g", name: "Gramo", family: "peso", to_base_factor: 1 },
  { code: "kg", name: "Kilogramo", family: "peso", to_base_factor: 1000 },
  { code: "ml", name: "Mililitro", family: "volumen", to_base_factor: 1 },
  { code: "lt", name: "Litro", family: "volumen", to_base_factor: 1000 },
  { code: "pza", name: "Pieza", family: "pieza", to_base_factor: 1 },
  { code: "paquete", name: "Paquete", family: "pieza", to_base_factor: 1 },
  { code: "porcion", name: "Porción", family: "pieza", to_base_factor: 1 },
];

// Unidades base seleccionables al dar de alta un ingrediente (una por familia).
export const BASE_UNIT_OPTIONS: { code: string; label: string }[] = [
  { code: "g", label: "Peso (gramos / kilos)" },
  { code: "ml", label: "Volumen (ml / litros)" },
  { code: "pza", label: "Unidades (piezas)" },
];

// Etiqueta corta del tipo de medida a partir de la unidad base
export function measureLabel(baseUnit: string | null | undefined): string {
  const f = familyOfBaseUnit(baseUnit);
  if (f === "peso") return "Peso";
  if (f === "volumen") return "Volumen";
  if (f === "pieza") return "Unidades";
  return "—";
}

// Categorías contables (eje financiero, separado de la categoría de cocina)
export const ACCOUNTING_CATEGORIES = [
  "Costo de venta",
  "Gasto de operación",
] as const;

export function unitByCode(code: string | null | undefined): Unit | undefined {
  if (!code) return undefined;
  return UNITS.find((u) => u.code === code);
}

export function familyOfBaseUnit(baseUnit: string | null | undefined): UnitFamily | undefined {
  return unitByCode(baseUnit)?.family;
}

// Unidades de compra válidas para un ingrediente = las de la misma familia que su unidad base.
export function purchaseUnitsFor(baseUnit: string | null | undefined): Unit[] {
  const fam = familyOfBaseUnit(baseUnit);
  if (!fam) return [];
  // 'porcion' es solo para rendimiento de recetas, no para comprar
  return UNITS.filter((u) => u.family === fam && u.code !== "porcion");
}

export function baseUnitLabel(code: string | null | undefined): string {
  const u = unitByCode(code);
  return u ? u.code : "—";
}

// ---------------------------------------------------------------------------
// Compras y semáforo
// ---------------------------------------------------------------------------
export type Purchase = {
  id: string;
  item_id: string;
  purchase_qty: number;
  purchase_unit: string;
  unit_cost: number;
  total_cost: number;
  qty_base: number;
  unit_cost_base: number;
  supplier: string | null;
  purchased_at: string;
  notes: string | null;
  created_at: string;
  item_name?: string;
};

export type StockStatus = "ok" | "low" | "out";

export function stockStatus(
  currentStock: number | null | undefined,
  minStock: number | null | undefined,
): StockStatus {
  const s = Number(currentStock ?? 0);
  const m = Number(minStock ?? 0);
  if (s <= 0) return "out";
  if (m > 0 && s <= m) return "low";
  return "ok";
}

export const STOCK_STATUS_META: Record<
  StockStatus,
  { emoji: string; label: string; className: string }
> = {
  ok: {
    emoji: "🟢",
    label: "Vas bien",
    className: "border-emerald-800 bg-emerald-950/40 text-emerald-200",
  },
  low: {
    emoji: "🟠",
    label: "Reordena",
    className: "border-amber-800 bg-amber-950/40 text-amber-200",
  },
  out: {
    emoji: "🔴",
    label: "Agotado",
    className: "border-red-900 bg-red-950/40 text-red-200",
  },
};
