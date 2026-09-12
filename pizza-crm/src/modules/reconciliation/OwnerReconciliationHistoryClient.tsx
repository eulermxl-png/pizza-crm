"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { MonthRangeQuickButtons } from "@/components/date/MonthRangeQuickButtons";
import {
  currentMonthRangeToToday,
  toLocalYmd,
} from "@/modules/expenses/lib/dateRange";
import {
  Button,
  Card,
  KpiCard,
  cn,
  IconAlert,
  IconCoins,
} from "@/components/ui";

import { exportReconciliationHistoryExcel } from "./lib/exportReconciliationHistory";
import type { CashReconciliationRow } from "./types";

const TOLERANCE = 0.009;

const money = (n: number) =>
  n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function mapRow(r: Record<string, unknown>): CashReconciliationRow {
  return {
    id: String(r.id),
    date: String(r.date).slice(0, 10),
    cash_total: Number(r.cash_total),
    terminal_total: Number(r.terminal_total),
    system_total: Number(r.system_total),
    difference: Number(r.difference),
    opening_float: r.opening_float == null ? null : Number(r.opening_float),
    cash_counted: r.cash_counted == null ? null : Number(r.cash_counted),
    cash_difference:
      r.cash_difference == null ? null : Number(r.cash_difference),
    cash_withdrawals:
      r.cash_withdrawals == null ? null : Number(r.cash_withdrawals),
    cash_deposits: r.cash_deposits == null ? null : Number(r.cash_deposits),
    tips_total: r.tips_total == null ? null : Number(r.tips_total),
    notes: (r.notes as string | null) ?? null,
  };
}

/** Tarjeta admin: define el fondo de caja objetivo (lo usa el cajero al cerrar). */
function FondoSettingCard() {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("num_value")
      .eq("key", "cash_fund_target")
      .maybeSingle();
    setValue(data?.num_value == null ? "700" : String(Number(data.num_value)));
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Ingresa un monto válido.");
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    const { error: upErr } = await supabase
      .from("app_settings")
      .upsert(
        { key: "cash_fund_target", num_value: n, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    setSaving(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setNote("Fondo actualizado.");
  }

  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wide text-muted2">
        Fondo de caja (lo define el admin)
      </p>
      <p className="mt-1 text-sm text-muted">
        Monto que se deja en la caja al cerrar y con el que abre el día
        siguiente. El cajero ya no lo edita.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted2">Fondo objetivo $</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setNote(null);
            }}
            disabled={!loaded}
            className="nums h-11 w-40 rounded-xl border border-line bg-surface3 px-3 text-rondaCream"
          />
        </div>
        <Button variant="primary" onClick={() => void save()} disabled={saving || !loaded}>
          {saving ? "Guardando…" : "Guardar fondo"}
        </Button>
        {note ? (
          <span className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
            {note}
          </span>
        ) : null}
        {error ? (
          <span className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export default function OwnerReconciliationHistoryClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const [from, setFrom] = useState(() => currentMonthRangeToToday().from);
  const [to, setTo] = useState(() => currentMonthRangeToToday().to);
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

  // Faltantes/sobrantes combinando efectivo Y tarjeta.
  const { totalFaltantes, totalSobrantes } = useMemo(() => {
    let faltantes = 0;
    let sobrantes = 0;
    const acc = (d: number) => {
      if (Math.abs(d) <= TOLERANCE) return;
      if (d > 0) sobrantes += d;
      else faltantes += Math.abs(d);
    };
    for (const r of rows) {
      acc(r.difference);
      if (r.cash_difference != null) acc(r.cash_difference);
    }
    return {
      totalFaltantes: Math.round(faltantes * 100) / 100,
      totalSobrantes: Math.round(sobrantes * 100) / 100,
    };
  }, [rows]);

  const diffCell = (d: number | null) => {
    if (d == null) return <span className="text-muted2">—</span>;
    const bad = Math.abs(d) > TOLERANCE;
    return (
      <span
        className="nums font-semibold"
        style={{ color: bad ? "var(--danger)" : "var(--ok)" }}
      >
        {d > 0 ? "+" : ""}
        {money(d)}
      </span>
    );
  };

  const totalTips = useMemo(
    () =>
      Math.round(
        rows.reduce((s, r) => s + (r.tips_total ?? 0), 0) * 100,
      ) / 100,
    [rows],
  );

  return (
    <div className="space-y-6">
      <FondoSettingCard />

      <Card>
        <p className="text-xs font-bold uppercase tracking-wide text-muted2">
          Rango
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <MonthRangeQuickButtons
            disabled={loading}
            onSelect={(range) => {
              setFrom(range.from);
              setTo(range.to > today ? today : range.to);
            }}
          />
          <div>
            <label className="mb-1 block text-xs text-muted2">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input-date-dark h-11 rounded-xl border border-line bg-surface3 px-3 text-rondaCream"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Hasta</label>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="input-date-dark h-11 rounded-xl border border-line bg-surface3 px-3 text-rondaCream"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            Actualizar
          </Button>
          <Button
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() => exportReconciliationHistoryExcel(rows, fileTag)}
          >
            Exportar Excel
          </Button>
        </div>
      </Card>

      {error ? (
        <div
          className="rounded-xl border border-transparent p-3 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            tone="danger"
            valueTone={totalFaltantes > 0 ? "danger" : undefined}
            icon={<IconAlert size={20} />}
            label="Total faltantes (efectivo + tarjeta)"
            value={money(totalFaltantes)}
          />
          <KpiCard
            tone="ok"
            valueTone={totalSobrantes > 0 ? "ok" : undefined}
            icon={<IconCoins size={20} />}
            label="Total sobrantes (efectivo + tarjeta)"
            value={money(totalSobrantes)}
          />
          <KpiCard
            tone="brand"
            icon={<IconCoins size={20} />}
            label="Propinas del período"
            value={money(totalTips)}
          />
        </div>
      ) : null}

      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-muted">
            No hay cierres en este rango.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm text-rondaCream">
              <thead className="border-b border-line bg-surface2 text-xs uppercase tracking-wide text-muted2">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Ventas efectivo
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Retiros / Abonos
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Efectivo contado
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Dif. efectivo
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Terminal</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Dif. tarjeta
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Propinas</th>
                  <th className="px-4 py-3 text-right font-medium">Notas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bad =
                    Math.abs(r.difference) > TOLERANCE ||
                    (r.cash_difference != null &&
                      Math.abs(r.cash_difference) > TOLERANCE);
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-b border-line last:border-0 hover:bg-surface2",
                      )}
                      style={bad ? { background: "var(--danger-soft)" } : undefined}
                    >
                      <td className="px-4 py-3 font-medium">{r.date}</td>
                      <td className="nums px-4 py-3 text-right text-muted">
                        {money(r.cash_total)}
                      </td>
                      <td className="nums px-4 py-3 text-right text-muted">
                        {(r.cash_withdrawals ?? 0) === 0 &&
                        (r.cash_deposits ?? 0) === 0 ? (
                          <span className="text-muted2">—</span>
                        ) : (
                          <>
                            {(r.cash_withdrawals ?? 0) > 0 ? (
                              <span style={{ color: "var(--danger)" }}>
                                −{money(r.cash_withdrawals ?? 0)}
                              </span>
                            ) : null}
                            {(r.cash_withdrawals ?? 0) > 0 &&
                            (r.cash_deposits ?? 0) > 0
                              ? " / "
                              : ""}
                            {(r.cash_deposits ?? 0) > 0 ? (
                              <span style={{ color: "var(--ok)" }}>
                                +{money(r.cash_deposits ?? 0)}
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="nums px-4 py-3 text-right">
                        {r.cash_counted == null ? (
                          <span className="text-muted2">—</span>
                        ) : (
                          money(r.cash_counted)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {diffCell(r.cash_difference)}
                      </td>
                      <td className="nums px-4 py-3 text-right text-muted">
                        {money(r.terminal_total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {diffCell(r.difference)}
                      </td>
                      <td className="nums px-4 py-3 text-right text-muted">
                        {r.tips_total == null ? (
                          <span className="text-muted2">—</span>
                        ) : (
                          money(r.tips_total)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {bad ? r.notes ?? "—" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
