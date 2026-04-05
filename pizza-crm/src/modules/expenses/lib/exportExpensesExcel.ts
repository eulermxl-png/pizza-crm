import * as XLSX from "xlsx";

import type { ExpenseRow } from "../types";

export function exportExpensesToExcel(rows: ExpenseRow[], filenameBase: string) {
  const sheetRows = rows.map((r) => ({
    Fecha: r.date,
    Categoría: r.category,
    Descripción: r.description,
    Importe: r.amount,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");

  const safeBase = filenameBase.replace(/[^\w\-]+/g, "_");
  XLSX.writeFile(wb, `gastos_${safeBase}.xlsx`);
}
