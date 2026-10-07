import * as XLSX from "xlsx";

import {
  COGS_CATEGORIES,
  INVENTORY_OPEX_LINE,
  SALES_CHANNELS,
  coverageWarning,
  type IncomeStatement,
  type PeriodFigures,
} from "./incomeStatement";

const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const PCT = "0.0%";
const INT = "#,##0";
const QTY = "#,##0.##";

type Cell = XLSX.CellObject;
type P = "Actual" | "Anterior";

const txt = (v: string): Cell => ({ t: "s", v });
const n = (v: number, z = MONEY): Cell => ({ t: "n", v, z });
const f = (formula: string, v: number | string, z = MONEY): Cell =>
  typeof v === "number" ? { t: "n", f: formula, v, z } : { t: "s", f: formula, v };

const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (part: number, whole: number): number | string => (whole === 0 ? "" : part / whole);
const variation = (cur: number, prev: number): number | string =>
  prev === 0 ? "" : (cur - prev) / Math.abs(prev);

function header(ws: XLSX.WorkSheet, cols: string[]) {
  cols.forEach((h, i) => (ws[XLSX.utils.encode_cell({ r: 0, c: i })] = txt(h)));
}

function finish(ws: XLSX.WorkSheet, lastCol: string, rows: number, widths: number[]) {
  ws["!ref"] = `A1:${lastCol}${Math.max(1, rows + 1)}`;
  ws["!cols"] = widths.map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: ws["!ref"] };
}

/* ---------- Ventas ---------- */
function salesSheet(st: IncomeStatement): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  header(ws, ["Fecha", "Canal", "Referencia", "Total cobrado", "Propina", "Venta neta", "Periodo"]);
  st.sales.forEach((s, i) => {
    const r = i + 2;
    ws[`A${r}`] = txt(s.fecha);
    ws[`B${r}`] = txt(s.canal);
    ws[`C${r}`] = txt(s.referencia);
    ws[`D${r}`] = n(s.total);
    ws[`E${r}`] = n(s.propina);
    ws[`F${r}`] = f(`D${r}-E${r}`, round2(s.total - s.propina));
    ws[`G${r}`] = txt(s.periodo);
  });
  finish(ws, "G", st.sales.length, [12, 13, 30, 14, 12, 14, 10]);
  return ws;
}

/* ---------- Gastos ---------- */
function expensesSheet(st: IncomeStatement): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  header(ws, ["Fecha", "Categoría", "Origen", "Rubro", "Descripción", "Monto", "Periodo"]);
  st.expenses.forEach((e, i) => {
    const r = i + 2;
    const cogs = COGS_CATEGORIES.map((c) => `B${r}="${c}"`).join(",");
    ws[`A${r}`] = txt(e.fecha);
    ws[`B${r}`] = txt(e.categoria);
    ws[`C${r}`] = txt(e.origen);
    // Rubro como fórmula: si corriges categoría u origen, el estado se recalcula.
    ws[`D${r}`] = f(
      `IF(C${r}="Compra de inventario","Compra de inventario",IF(OR(${cogs}),"Costo de venta","Gasto de operación"))`,
      e.rubro,
    );
    ws[`E${r}`] = txt(e.descripcion);
    ws[`F${r}`] = n(e.monto);
    ws[`G${r}`] = txt(e.periodo);
  });
  finish(ws, "G", st.expenses.length, [12, 20, 20, 22, 44, 14, 10]);
  return ws;
}

/* ---------- Consumo de inventario ---------- */
function consumptionSheet(st: IncomeStatement): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  header(ws, ["Insumo", "Tipo", "Rubro", "Cantidad", "Unidad", "Costo unitario prom.", "Costo", "Periodo"]);
  st.consumption.forEach((c, i) => {
    const r = i + 2;
    ws[`A${r}`] = txt(c.insumo);
    ws[`B${r}`] = txt(c.tipo);
    ws[`C${r}`] = txt(c.rubro);
    ws[`D${r}`] = n(c.cantidad, QTY);
    ws[`E${r}`] = txt(c.unidad);
    ws[`F${r}`] = f(`IF(D${r}=0,0,G${r}/D${r})`, c.cantidad === 0 ? 0 : c.costo / c.cantidad, '"$"#,##0.0000');
    ws[`G${r}`] = n(c.costo);
    ws[`H${r}`] = txt(c.periodo);
  });
  finish(ws, "H", st.consumption.length, [30, 10, 20, 12, 8, 18, 14, 10]);
  return ws;
}

/* ---------- Estado de resultados ---------- */
type LineDef = {
  label: string;
  formula: (p: P, col: "B" | "D") => string;
  value: (fig: PeriodFigures) => number;
};

const SV = (canal: string) => (p: P) =>
  `SUMIFS(Ventas!$F:$F,Ventas!$B:$B,"${canal}",Ventas!$G:$G,"${p}")`;
const SC = (rubro: string, tipo?: string) => (p: P) =>
  `SUMIFS(Consumo!$G:$G,Consumo!$C:$C,"${rubro}",${tipo ? `Consumo!$B:$B,"${tipo}",` : ""}Consumo!$H:$H,"${p}")`;
const SG = (rubro: string, cat?: string) => (p: P) =>
  `SUMIFS(Gastos!$F:$F,${cat ? `Gastos!$B:$B,"${cat}",` : ""}Gastos!$D:$D,"${rubro}",Gastos!$G:$G,"${p}")`;

function statementSheet(st: IncomeStatement): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let row = 1;
  const put = (ref: string, c: Cell) => (ws[ref] = c);
  const lines: { row: number; def: LineDef }[] = [];
  const line = (def: LineDef) => {
    const r = row++;
    put(`A${r}`, txt(def.label));
    lines.push({ row: r, def });
    return r;
  };
  const section = (label: string) => put(`A${row++}`, txt(label));
  const sumOf = (rows: number[]) => (_p: P, col: "B" | "D") =>
    `SUM(${col}${rows[0]}:${col}${rows[rows.length - 1]})`;

  put(`A${row++}`, txt("Ronda 12 — Estado de resultados"));
  put(`A${row++}`, txt(`Periodo actual: ${st.actual.from} a ${st.actual.to}`));
  put(`A${row++}`, txt(`Periodo anterior: ${st.anterior.from} a ${st.anterior.to}`));
  put(`A${row++}`, txt(`Generado: ${new Date().toLocaleString("es-MX")}`));
  row++;
  ["Concepto", "Actual", "% ventas", "Anterior", "% ventas", "Variación $", "Variación %"].forEach(
    (h, i) => put(XLSX.utils.encode_cell({ r: row - 1, c: i }), txt(h)),
  );
  row++;

  section("VENTAS (sin propinas)");
  const chRows = SALES_CHANNELS.map((canal) =>
    line({
      label: `  ${canal === "Plataformas" ? "Plataformas (Uber / DiDi)" : canal}`,
      formula: SV(canal),
      value: (fig) => fig.ventas[canal],
    }),
  );
  const salesRow = line({ label: "Ventas totales", formula: sumOf(chRows), value: (fig) => fig.ventasTotal });

  row++;
  section("COSTO DE VENTA");
  const cogsRows = [
    line({ label: "  Consumo de insumos (inventario)", formula: SC("Costo de venta", "Consumo"), value: (fig) => fig.costoConsumo }),
    line({ label: "  Merma de inventario", formula: SC("Costo de venta", "Merma"), value: (fig) => fig.costoMerma }),
    line({ label: "  Insumos capturados como gasto", formula: SG("Costo de venta"), value: (fig) => fig.costoManual }),
  ];
  const cogsRow = line({ label: "Costo de venta total", formula: sumOf(cogsRows), value: (fig) => fig.costoVenta });
  const grossRow = line({
    label: "UTILIDAD BRUTA",
    formula: (_p, c) => `${c}${salesRow}-${c}${cogsRow}`,
    value: (fig) => fig.utilidadBruta,
  });

  row++;
  section("GASTOS DE OPERACIÓN");
  const opexRows = st.opexCategories.map((cat) =>
    line({
      label: `  ${cat}`,
      formula: cat === INVENTORY_OPEX_LINE ? SC("Gasto de operación") : SG("Gasto de operación", cat),
      value: (fig) => fig.opex[cat] ?? 0,
    }),
  );
  const opexRow = line({ label: "Total gastos de operación", formula: sumOf(opexRows), value: (fig) => fig.opexTotal });
  row++;
  const opRow = line({
    label: "UTILIDAD DE OPERACIÓN",
    formula: (_p, c) => `${c}${grossRow}-${c}${opexRow}`,
    value: (fig) => fig.utilidadOperacion,
  });

  for (const { row: r, def } of lines) {
    const cur = def.value(st.cur);
    const prev = def.value(st.prev);
    put(`B${r}`, f(def.formula("Actual", "B"), cur));
    put(`D${r}`, f(def.formula("Anterior", "D"), prev));
    put(`C${r}`, f(`IF(B$${salesRow}=0,"",B${r}/B$${salesRow})`, pct(cur, st.cur.ventasTotal), PCT));
    put(`E${r}`, f(`IF(D$${salesRow}=0,"",D${r}/D$${salesRow})`, pct(prev, st.prev.ventasTotal), PCT));
    put(`F${r}`, f(`B${r}-D${r}`, round2(cur - prev)));
    put(`G${r}`, f(`IF(D${r}=0,"",F${r}/ABS(D${r}))`, variation(cur, prev), PCT));
  }

  row++;
  section("INDICADORES");
  const ind = (label: string, fb: string, fd: string, vb: number, vd: number, z: string) => {
    const r = row++;
    put(`A${r}`, txt(label));
    put(`B${r}`, f(fb, vb, z));
    put(`D${r}`, f(fd, vd, z));
    return r;
  };
  const both = (fn: (p: P, c: "B" | "D") => string) => [fn("Actual", "B"), fn("Anterior", "D")] as const;
  ind("  Margen bruto", ...both((_p, c) => `IF(${c}${salesRow}=0,0,${c}${grossRow}/${c}${salesRow})`), st.cur.margenBruto, st.prev.margenBruto, PCT);
  ind("  Margen operativo", ...both((_p, c) => `IF(${c}${salesRow}=0,0,${c}${opRow}/${c}${salesRow})`), st.cur.margenOperativo, st.prev.margenOperativo, PCT);
  const ordRow = ind(
    "  Órdenes (restaurante + plataformas)",
    ...both((p) => `COUNTIFS(Ventas!$G:$G,"${p}",Ventas!$B:$B,"<>Mayoreo")`),
    st.cur.ordenes,
    st.prev.ordenes,
    INT,
  );
  ind(
    "  Ticket promedio",
    ...both((_p, c) => `IF(${c}${ordRow}=0,0,(${c}${chRows[0]}+${c}${chRows[1]})/${c}${ordRow})`),
    st.cur.ticketPromedio,
    st.prev.ticketPromedio,
    MONEY,
  );
  ind("  Propinas recibidas (no son ingreso)", ...both((p) => `SUMIFS(Ventas!$E:$E,Ventas!$G:$G,"${p}")`), st.cur.propinas, st.prev.propinas, MONEY);
  ind("  Compras de inventario (no suman al resultado)", ...both(SG("Compra de inventario")), st.cur.comprasInventario, st.prev.comprasInventario, MONEY);

  row++;
  put(`A${row++}`, txt("Notas:"));
  const notes = [
    "• Ventas = total cobrado menos propinas; excluye órdenes canceladas. Mayoreo por fecha de venta; excluye merma.",
    "• Plataformas a precio de plataforma; las comisiones de Uber/DiDi no están registradas.",
    "• Costo de venta = consumo real del inventario a costo promedio. Las compras de inventario no se suman (se vuelven costo al consumirse).",
    "• Las cifras salen de las hojas Ventas, Gastos y Consumo: si corriges ahí, este reporte se recalcula.",
  ];
  const cw = coverageWarning(st.cur.coverage);
  if (cw) notes.push(`• Cobertura del periodo actual: ${cw}.`);
  for (const t of notes) put(`A${row++}`, txt(t));

  ws["!ref"] = `A1:G${row}`;
  ws["!cols"] = [{ wch: 44 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
  return ws;
}

export function buildIncomeStatementWorkbook(st: IncomeStatement): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, statementSheet(st), "Estado de resultados");
  XLSX.utils.book_append_sheet(wb, salesSheet(st), "Ventas");
  XLSX.utils.book_append_sheet(wb, expensesSheet(st), "Gastos");
  XLSX.utils.book_append_sheet(wb, consumptionSheet(st), "Consumo");
  return wb;
}

export function exportIncomeStatementExcel(st: IncomeStatement) {
  const label = `${st.actual.from}_a_${st.actual.to}`.replace(/[^\d\-_a-z]+/gi, "_");
  XLSX.writeFile(buildIncomeStatementWorkbook(st), `estado_resultados_${label}.xlsx`);
}
