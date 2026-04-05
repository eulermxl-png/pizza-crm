export const EXPENSE_CATEGORIES = [
  "Renta",
  "Insumos",
  "Nómina",
  "Servicios",
  "Mantenimiento",
  "Otros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
