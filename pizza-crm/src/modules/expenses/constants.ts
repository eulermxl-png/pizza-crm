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
