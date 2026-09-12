import * as XLSX from "xlsx";

import type { CashReconciliationRow } from "../types";

export function exportReconciliationHistoryExcel(
  rows: CashReconciliationRow[],
  rangeLabel: string,
) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Fecha: r.date,
      "Efectivo sistema ($)": r.cash_total,
      "Tarjeta sistema ($)": r.system_total,
      "Terminal tarjeta real ($)": r.terminal_total,
      "Diferencia ($)": r.difference,
      Notas: r.notes ?? "",
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cierres");
  const safe = rangeLabel.replace(/[^\w\-]+/g, "_");
  XLSX.writeFile(wb, `cierres_caja_${safe}.xlsx`);
}
