"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button, Card, cn } from "@/components/ui";

import {
  coverageWarning,
  loadIncomeStatement,
  previousComparableRange,
  SALES_CHANNELS,
  type DateRange,
  type IncomeStatement,
  type PeriodFigures,
} from "./lib/incomeStatement";
import { exportIncomeStatementExcel } from "./lib/exportIncomeStatementExcel";

const money = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** income: subir es bueno · cost: subir es malo */
type Kind = "income" | "cost";

type Line = {
  label: string;
  value: (p: PeriodFigures) => number;
  kind: Kind;
  strong?: boolean;
  indent?: boolean;
  result?: boolean;
  /** encabezado de sección que va antes de este renglón */
  section?: string;
};

function buildLines(data: IncomeStatement): Line[] {
  return [
    ...SALES_CHANNELS.map<Line>((c, i) => ({
      section: i === 0 ? "Ventas (sin propinas)" : undefined,
      label: c === "Plataformas" ? "Plataformas (Uber / DiDi)" : c,
      value: (p) => p.ventas[c],
      kind: "income",
      indent: true,
    })),
    { label: "Ventas totales", value: (p) => p.ventasTotal, kind: "income", strong: true },
    {
      section: "Costo de venta",
      label: "Consumo de insumos (inventario)",
      value: (p) => p.costoConsumo,
      kind: "cost",
      indent: true,
    },
    { label: "Merma de inventario", value: (p) => p.costoMerma, kind: "cost", indent: true },
    { label: "Insumos capturados como gasto", value: (p) => p.costoManual, kind: "cost", indent: true },
    { label: "Costo de venta total", value: (p) => p.costoVenta, kind: "cost", strong: true },
    { label: "Utilidad bruta", value: (p) => p.utilidadBruta, kind: "income", strong: true, result: true },
    ...data.opexCategories.map<Line>((c, i) => ({
      section: i === 0 ? "Gastos de operación" : undefined,
      label: c,
      value: (p) => p.opex[c] ?? 0,
      kind: "cost",
      indent: true,
    })),
    { label: "Total gastos de operación", value: (p) => p.opexTotal, kind: "cost", strong: true },
    { label: "Utilidad de operación", value: (p) => p.utilidadOperacion, kind: "income", strong: true, result: true },
  ];
}

/** Resumen compacto que se manda al modelo para el comentario. */
function summaryForAnalysis(data: IncomeStatement, lines: Line[]) {
  return {
    periodoActual: data.actual,
    periodoAnterior: data.anterior,
    renglones: lines.map((l) => ({
      concepto: l.label,
      actual: l.value(data.cur),
      anterior: l.value(data.prev),
    })),
    indicadores: {
      margenBruto: { actual: data.cur.margenBruto, anterior: data.prev.margenBruto },
      margenOperativo: { actual: data.cur.margenOperativo, anterior: data.prev.margenOperativo },
      ordenes: { actual: data.cur.ordenes, anterior: data.prev.ordenes },
      ticketPromedio: { actual: data.cur.ticketPromedio, anterior: data.prev.ticketPromedio },
      propinas: { actual: data.cur.propinas, anterior: data.prev.propinas },
      comprasInventario: { actual: data.cur.comprasInventario, anterior: data.prev.comprasInventario },
    },
    principalesInsumos: data.consumption
      .filter((c) => c.periodo === "Actual")
      .slice(0, 8)
      .map((c) => ({ insumo: c.insumo, rubro: c.rubro, costo: c.costo })),
    cobertura: {
      actual: data.cur.coverage,
      anterior: data.prev.coverage,
    },
  };
}

function VarCell({ cur, prev, kind }: { cur: number; prev: number; kind: Kind }) {
  const diff = cur - prev;
  if (prev === 0 && cur === 0) return <span className="text-muted2">—</span>;
  const good = kind === "income" ? diff >= 0 : diff <= 0;
  const rel = prev === 0 ? null : diff / Math.abs(prev);
  return (
    <span
      className={cn("nums", diff !== 0 && (good ? "er-pos" : "er-neg"))}
      style={{ color: diff === 0 ? undefined : good ? "var(--ok)" : "var(--danger)" }}
    >
      {diff > 0 ? "+" : ""}
      {money(diff)}
      {rel !== null ? (
        <span className="ml-1 text-xs opacity-80">
          ({diff > 0 ? "+" : ""}
          {(rel * 100).toFixed(0)}%)
        </span>
      ) : null}
    </span>
  );
}

/** Estado de resultados para el rango que ya eligió el Tablero de reportes. */
export default function IncomeStatementClient({ range: rangeProp }: { range: DateRange }) {
  const { from, to } = rangeProp;
  const range = useMemo(() => ({ from, to }), [from, to]);
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const prevRange = useMemo(() => previousComparableRange(range), [range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setAnalysisError(null);
    try {
      setData(await loadIncomeStatement(supabase, range));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el reporte.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = useMemo(() => (data ? buildLines(data) : []), [data]);
  const coverage = data ? coverageWarning(data.cur.coverage) : null;

  async function analyze() {
    if (!data) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/v1/ai/income-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumen: summaryForAnalysis(data, lines) }),
      });
      const json = (await res.json()) as { comentario?: string; error?: string };
      if (!res.ok || !json.comentario) throw new Error(json.error ?? "No se pudo generar el análisis.");
      setAnalysis(json.comentario);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "No se pudo generar el análisis.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: letter; margin: 14mm; }
          body * { visibility: hidden !important; }
          *:has(#er-print) {
            position: static !important; overflow: visible !important;
            max-height: none !important; transform: none !important;
          }
          #er-print, #er-print * { visibility: visible !important; }
          #er-print {
            position: absolute; left: 0; top: 0; width: 100%;
            background: #fff !important; padding: 0 !important;
            border: none !important; box-shadow: none !important;
          }
          #er-print * {
            color: #111 !important; background: transparent !important;
            border-color: #bbb !important; box-shadow: none !important;
          }
          #er-print .er-pos, #er-print .er-pos * { color: #0a6b3a !important; }
          #er-print .er-neg, #er-print .er-neg * { color: #b42318 !important; }
          #er-print .er-nobreak { break-inside: avoid; }
          #er-print .er-noprint { display: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {fmtYmd(range.from)} – {fmtYmd(range.to)} vs {fmtYmd(prevRange.from)} –{" "}
          {fmtYmd(prevRange.to)}. Para el PDF elige “Guardar como PDF”.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={loading || !data || analyzing} onClick={() => void analyze()}>
            {analyzing ? "Analizando…" : analysis ? "Regenerar análisis" : "Generar análisis (IA)"}
          </Button>
          <Button variant="secondary" size="sm" disabled={loading || !data} onClick={() => window.print()}>
            Descargar PDF
          </Button>
          <Button size="sm" disabled={loading || !data} onClick={() => data && exportIncomeStatementExcel(data)}>
            Exportar Excel
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
      ) : null}
      {loading ? <p className="text-center text-muted2">Generando estado de resultados…</p> : null}

      {data && !loading ? (
        <Card id="er-print" className="space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted2">Ronda 12</p>
              <h3 className="text-2xl font-bold text-rondaCream">Estado de resultados</h3>
              <p className="mt-1 text-sm text-muted">
                {fmtYmd(data.actual.from)} – {fmtYmd(data.actual.to)}
                <span className="text-muted2">
                  {" "}· vs {fmtYmd(data.anterior.from)} – {fmtYmd(data.anterior.to)}
                </span>
              </p>
            </div>
            <p className="text-xs text-muted2">
              Generado {new Date().toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </header>

          {coverage ? (
            <div
              className="rounded-xl border p-3 text-xs"
              style={{ borderColor: "var(--warn)", background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              <strong>Costo de venta incompleto:</strong> {coverage}. El costo real puede ser mayor.
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted2">
                  <th className="py-2 pr-3 font-semibold">Concepto</th>
                  <th className="py-2 pr-3 text-right font-semibold">Actual</th>
                  <th className="py-2 pr-3 text-right font-semibold">% ventas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Anterior</th>
                  <th className="py-2 text-right font-semibold">Variación</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const cur = l.value(data.cur);
                  const prev = l.value(data.prev);
                  return (
                    <Fragment key={l.label}>
                      {l.section ? (
                        <tr>
                          <td colSpan={5} className="pt-5 pb-1 text-xs font-bold uppercase tracking-wide text-muted2">
                            {l.section}
                          </td>
                        </tr>
                      ) : null}
                      <tr
                        className={cn(
                          "border-b border-line/60",
                          l.strong && "font-bold text-rondaCream",
                          l.result && "border-b-2 border-lineStrong",
                        )}
                      >
                        <td className={cn("py-2 pr-3", l.indent ? "pl-4 text-muted" : "text-rondaCream")}>{l.label}</td>
                        <td
                          className={cn("nums py-2 pr-3 text-right", l.result && (cur >= 0 ? "er-pos" : "er-neg"))}
                          style={l.result ? { color: cur >= 0 ? "var(--ok)" : "var(--danger)" } : undefined}
                        >
                          {money(cur)}
                        </td>
                        <td className="nums py-2 pr-3 text-right text-muted">
                          {data.cur.ventasTotal > 0 ? pct(cur / data.cur.ventasTotal) : "—"}
                        </td>
                        <td className="nums py-2 pr-3 text-right text-muted">{money(prev)}</td>
                        <td className="py-2 text-right">
                          <VarCell cur={cur} prev={prev} kind={l.kind} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="er-nobreak">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted2">Indicadores</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {(
                [
                  ["Margen bruto", pct(data.cur.margenBruto), `Anterior: ${pct(data.prev.margenBruto)}`],
                  ["Margen operativo", pct(data.cur.margenOperativo), `Anterior: ${pct(data.prev.margenOperativo)}`],
                  ["Órdenes", String(data.cur.ordenes), `Anterior: ${data.prev.ordenes}`],
                  ["Ticket promedio", money(data.cur.ticketPromedio), `Anterior: ${money(data.prev.ticketPromedio)}`],
                  ["Propinas (no son ingreso)", money(data.cur.propinas), `Anterior: ${money(data.prev.propinas)}`],
                  [
                    "Compras de inventario",
                    money(data.cur.comprasInventario),
                    "Informativo: se vuelven costo al consumirse",
                  ],
                ] as const
              ).map(([label, value, sub]) => (
                <div key={label} className="rounded-xl border border-line bg-surface2 p-3">
                  <p className="text-xs text-muted2">{label}</p>
                  <p className="nums mt-1 text-xl font-bold text-rondaCream">{value}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {analysisError ? (
            <p className="er-noprint text-sm" style={{ color: "var(--danger)" }}>{analysisError}</p>
          ) : null}
          {analysis ? (
            <section className="er-nobreak rounded-xl border border-line bg-surface2 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted2">
                Análisis (generado por IA a partir de las cifras de arriba)
              </p>
              <div className="space-y-2 text-sm leading-relaxed text-rondaCream">
                {analysis.split(/\n+/).filter(Boolean).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ) : null}

          <ul className="er-nobreak space-y-1 border-t border-line pt-4 text-xs text-muted">
            <li>• Ventas = total cobrado menos propinas; excluye órdenes canceladas. Mayoreo por fecha de venta; excluye merma.</li>
            <li>• Plataformas a precio de plataforma; las comisiones de Uber/DiDi no están registradas.</li>
            <li>• Costo de venta = consumo real del inventario a costo promedio. Las compras de inventario no se suman como gasto.</li>
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
