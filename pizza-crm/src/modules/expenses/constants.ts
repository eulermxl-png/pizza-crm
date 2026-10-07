export const EXPENSE_CATEGORIES = [
  "Renta",
  "Insumos",
  "Costo de venta",
  "Gasto de operación",
  "Nómina",
  "Servicios",
  "Mantenimiento",
  "Otros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Rubro de un gasto de operación (lo que separa el estado de resultados).
 * Cada concepto (Luz, Agua, Renta…) lleva su rubro; al capturar se guarda en `expenses.category`.
 */
export const OPEX_RUBROS = [
  "Servicios",
  "Renta",
  "Nómina",
  "Mantenimiento",
  "Gasto de operación",
  "Otros",
] as const;

/** Categoría que se guarda al capturar un gasto con concepto. */
export function categoryForConcept(c: { accounting_category: string; expense_category?: string | null }): string {
  if (c.accounting_category === "Costo de venta") return "Costo de venta";
  return c.expense_category?.trim() || c.accounting_category;
}
