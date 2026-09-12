import * as XLSX from "xlsx";

import type { CashReconciliationRow } from "../types";

export function exportReconciliationHistoryExcel(
  rows: CashReconciliationRow[],
  rangeLabel: string,
) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Fecha: r.date,
      "Fondo ($)": r.opening_float ?? "",
      "Ventas efectivo ($)": r.cash_total,
      "Retiros ($)": r.cash_withdrawals ?? "",
      "Abonos ($)": r.cash_deposits ?? "",
      "Efectivo contado ($)": r.cash_counted ?? "",
      "Dif. efectivo ($)": r.cash_difference ?? "",
      "Tarjeta sistema ($)": r.system_total,
      "Terminal tarjeta ($)": r.terminal_total,
      "Dif. tarjeta ($)": r.difference,
      "Propinas ($)": r.tips_total ?? "",
      Notas: r.notes ?? "",
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cierres");
  const safe = rangeLabel.replace(/[^\w\-]+/g, "_");
  XLSX.writeFile(wb, `cierres_caja_${safe}.xlsx`);
}
