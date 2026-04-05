"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

import { exportReconciliationHistoryExcel } from "./lib/exportReconciliationHistory";
import type { CashReconciliationRow } from "./types";

const TOLERANCE = 0.009;

function mapRow(r: Record<string, unknown>): CashReconciliationRow {
  return {
    id: String(r.id),
    date: String(r.date).slice(0, 10),
    cash_total: Number(r.cash_total),
    terminal_total: Number(r.terminal_total),
    system_total: Number(r.system_total),
    difference: Number(r.difference),
    notes: (r.notes as string | null) ?? null,
  };
}

export default function OwnerReconciliationHistoryClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const [from, setFrom] = useState(() => {
    const n = new Date();
    return toLocalYmd(new Date(n.getFullYear(), n.getMonth(), 1));
  });
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<CashReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromNorm = from <= to ? from : to;
  const toNorm = from <= to ? to : from;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("cash_reconciliation")
      .select("*")
      .gte("date", fromNorm)
      .lte("date", toNorm)
      .order("date", { ascending: false });

    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data ?? []).map((r) => mapRow(r as Record<string, unknown>)));
    }
    setLoading(false);
  }, [supabase, fromNorm, toNorm]);

  useEffect(() => {
    void load();
  }, [load]);

  const fileTag = `${fromNorm}_a_${toNorm}`;

  const { totalFaltantes, totalSobrantes } = useMemo(() => {
    let faltantes = 0;
    let sobrantes = 0;
    for (const r of rows) {
      const ok = Math.abs(r.difference) <= TOLERANCE;
      if (ok) continue;
      if (r.difference > 0) sobrantes += r.difference;
      else faltantes += Math.abs(r.difference);
    }
    return {
      totalFaltantes: Math.round(faltantes * 100) / 100,
      totalSobrantes: Math.round(sobrantes * 100) / 100,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Rango
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Hasta</label>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-11 rounded-lg border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => exportReconciliationHistoryExcel(rows, fileTag)}
          className="h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
        >
          Exportar Excel
        </button>
      </div>

      {rows.length > 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Resumen de diferencias
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3">
              <p className="text-xs font-semibold text-red-200">Total faltantes</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-red-300">
                ${totalFaltantes.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
              <p className="text-xs font-semibold text-emerald-200">
                Total sobrantes
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-300">
                ${totalSobrantes.toFixed(2)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        {loading ? (
          <p className="p-8 text-center text-zinc-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">
            No hay cierres en este rango.
          </p>
        ) : (
          <table className="w-full min-w-[800px] text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Efectivo (sist.)</th>
                <th className="px-4 py-3 text-right">Tarjeta (sist.)</th>
                <th className="px-4 py-3 text-right">Terminal (tarjeta)</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3 text-right">Notas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hasDiff = Math.abs(r.difference) > TOLERANCE;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-zinc-800/80 hover:bg-zinc-900/40 ${
                      hasDiff ? "bg-red-950/25" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-zinc-100">
                      {r.date}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${r.cash_total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sky-300">
                      ${r.system_total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${r.terminal_total.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold tabular-nums ${
                        hasDiff ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      ${r.difference.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {hasDiff ? r.notes ?? "—" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
