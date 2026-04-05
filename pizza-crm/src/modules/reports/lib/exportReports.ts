import * as XLSX from "xlsx";

export type BestSellerExportRow = {
  name: string;
  category: string;
  units: number;
  revenue: number;
};

export function exportBestSellersExcel(
  rows: BestSellerExportRow[],
  rangeLabel: string,
) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Producto: r.name,
      Categoría: r.category,
      "Unidades vendidas": r.units,
      "Ingresos ($)": r.revenue,
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Top productos");
  XLSX.writeFile(wb, `reporte_top_productos_${rangeLabel}.xlsx`);
}

export type DailyPnLRow = {
  fecha: string;
  ventas: number;
  gastos: number;
  neto: number;
};

export function exportRevenueExpensesExcel(
  daily: DailyPnLRow[],
  totals: { ventas: number; gastos: number; neto: number },
  rangeLabel: string,
) {
  const wb = XLSX.utils.book_new();
  const detail = XLSX.utils.json_to_sheet(
    daily.map((d) => ({
      Fecha: d.fecha,
      "Ventas ($)": d.ventas,
      "Gastos ($)": d.gastos,
      "Neto ($)": d.neto,
    })),
  );
  XLSX.utils.book_append_sheet(wb, detail, "Por día");
  const summary = XLSX.utils.json_to_sheet([
    {
      Periodo: "Total",
      "Ventas ($)": totals.ventas,
      "Gastos ($)": totals.gastos,
      "Utilidad neta ($)": totals.neto,
    },
  ]);
  XLSX.utils.book_append_sheet(wb, summary, "Resumen");
  XLSX.writeFile(wb, `reporte_ventas_gastos_${rangeLabel}.xlsx`);
}

export function exportHeatmapExcel(
  grid: number[][],
  rangeLabel: string,
  weekdayLabels: readonly string[],
  hours: readonly number[],
) {
  const aoa: (string | number)[][] = [["Hora", ...weekdayLabels]];
  for (let r = 0; r < grid.length; r++) {
    const h = hours[r] ?? 6 + r;
    const label = `${String(h).padStart(2, "0")}:00`;
    aoa.push([label, ...(grid[r] ?? [])]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Horas pico");
  XLSX.writeFile(wb, `reporte_horas_pico_${rangeLabel}.xlsx`);
}
