"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

import { fetchDayPaymentTotals } from "./lib/fetchDayPaymentTotals";
import type { CashReconciliationRow } from "./types";

const TOLERANCE = 0.009;

export default function CashierReconciliationClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const [date, setDate] = useState(today);
  const [cashSystem, setCashSystem] = useState(0);
  const [cardSystem, setCardSystem] = useState(0);
  const [ordersWithoutMethod, setOrdersWithoutMethod] = useState(0);
  const [terminalInput, setTerminalInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CashReconciliationRow | null>(null);

  const loadDay = useCallback(async () => {
    setError(null);
    setLoading(true);
    setSaved(null);
    try {
      const totals = await fetchDayPaymentTotals(supabase, date);
      setCashSystem(totals.cashSystem);
      setCardSystem(totals.cardSystem);
      setOrdersWithoutMethod(totals.ordersWithoutMethod);

      const { data: existing, error: exErr } = await supabase
        .from("cash_reconciliation")
        .select("*")
        .eq("date", date)
        .maybeSingle();

      if (exErr) throw new Error(exErr.message);
      if (existing) {
        setSaved(mapRow(existing));
        setTerminalInput(String(existing.terminal_total));
        setNotesInput(existing.notes ?? "");
      } else {
        setTerminalInput("");
        setNotesInput("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
      setCashSystem(0);
      setCardSystem(0);
      setOrdersWithoutMethod(0);
    } finally {
      setLoading(false);
    }
  }, [supabase, date]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  const actualTerminal = useMemo(() => {
    const n = Number(terminalInput);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [terminalInput]);

  const difference = useMemo(
    () => Math.round((actualTerminal - cardSystem) * 100) / 100,
    [actualTerminal, cardSystem],
  );

  const matches = useMemo(
    () => terminalInput.trim() !== "" && Math.abs(difference) <= TOLERANCE,
    [terminalInput, difference],
  );

  const showNotes = useMemo(() => {
    // Show notes whenever the cashier is going to save a mismatch.
    return terminalInput.trim() !== "" && !matches;
  }, [terminalInput, matches]);

  async function saveReconciliation() {
    if (terminalInput.trim() === "") {
      setError("Ingresa el monto del terminal de tarjeta.");
      return;
    }

    setSaving(true);
    setError(null);

    const row = {
      date,
      cash_total: cashSystem,
      system_total: cardSystem,
      terminal_total: actualTerminal,
      difference,
      notes: showNotes ? notesInput.trim() || null : null,
    };

    try {
      const { data: existing, error: qErr } = await supabase
        .from("cash_reconciliation")
        .select("id")
        .eq("date", date)
        .maybeSingle();

      if (qErr) throw new Error(qErr.message);

      if (existing?.id) {
        const { error: uErr } = await supabase
          .from("cash_reconciliation")
          .update(row)
          .eq("id", existing.id);
        if (uErr) throw new Error(uErr.message);
      } else {
        const { error: iErr } = await supabase
          .from("cash_reconciliation")
          .insert(row);
        if (iErr) throw new Error(iErr.message);
      }

      await loadDay();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-50">Cierre de caja</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Compara lo registrado en el sistema con el corte del terminal de
          tarjeta del día.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Fecha del cierre
        </label>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : (
        <>
          {ordersWithoutMethod > 0 ? (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-100">
              Hay {ordersWithoutMethod} pedido(s) este día sin método de pago
              registrado; no entran en los totales de efectivo/tarjeta.
            </div>
          ) : null}

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Totales en sistema (pedidos del día)
            </p>
            <div className="flex justify-between text-sm text-zinc-300">
              <span>Efectivo</span>
              <span className="font-semibold tabular-nums text-emerald-400">
                ${cashSystem.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-zinc-300">
              <span>Tarjeta</span>
              <span className="font-semibold tabular-nums text-sky-400">
                ${cardSystem.toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Monto real del terminal (tarjeta)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              placeholder="0.00"
              className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-lg font-semibold tabular-nums text-zinc-100"
            />
          </div>

          {terminalInput.trim() !== "" ? (
            <div
              className={
                matches
                  ? "rounded-xl border-2 border-emerald-600 bg-emerald-950/40 p-4 text-center"
                  : "rounded-xl border-2 border-red-600 bg-red-950/40 p-4 text-center"
              }
            >
              {matches ? (
                <>
                  <p className="text-lg font-bold text-emerald-400">
                    Coincide con el sistema
                  </p>
                  <p className="mt-1 text-sm text-emerald-200/80">
                    Terminal y registro de tarjeta cuadran.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-red-400">Diferencia</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-red-200">
                    ${difference.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-red-200/70">
                    Terminal: ${actualTerminal.toFixed(2)} · Sistema tarjeta: $
                    {cardSystem.toFixed(2)}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {showNotes ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Notas (opcional) para explicar la diferencia
              </label>
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                rows={3}
                placeholder='Ej. "Se rompió un billete", "Error al cobrar", "Cliente pagó de más"'
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-rondaAccent"
              />
            </div>
          ) : null}

          <button
            type="button"
            disabled={saving || terminalInput.trim() === ""}
            onClick={() => void saveReconciliation()}
            className="h-12 w-full rounded-lg bg-rondaAccent text-base font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar cierre del día"}
          </button>

          {saved ? (
            <p className="text-center text-xs text-zinc-500">
              Último guardado para esta fecha: #{saved.id.slice(0, 8)}…
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

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
