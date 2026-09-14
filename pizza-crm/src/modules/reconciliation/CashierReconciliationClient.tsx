"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";
import {
  Button,
  Card,
  Field,
  StatusBadge,
  cn,
  inputCls,
} from "@/components/ui";

import { fetchDayPaymentTotals } from "./lib/fetchDayPaymentTotals";
import type { CashMovementRow, CashReconciliationRow } from "./types";

const TOLERANCE = 0.009;
const DEFAULT_OPENING_FLOAT = 700;

const money = (n: number) =>
  n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function CashierReconciliationClient() {
  const supabase = useMemo(() => createClient(), []);
  // La fecha del corte es siempre hoy (no editable).
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const date = today;

  const [cashSystem, setCashSystem] = useState(0);
  const [cardSystem, setCardSystem] = useState(0);
  const [tipsSystem, setTipsSystem] = useState(0);
  const [ordersWithoutMethod, setOrdersWithoutMethod] = useState(0);

  // Fondo objetivo definido por el admin (solo lectura para el cajero).
  const [openingFloat, setOpeningFloat] = useState(DEFAULT_OPENING_FLOAT);

  const [movements, setMovements] = useState<CashMovementRow[]>([]);
  const [movKind, setMovKind] = useState<"retiro" | "abono">("retiro");
  const [movAmount, setMovAmount] = useState("");
  const [movReason, setMovReason] = useState("");
  const [movBusy, setMovBusy] = useState(false);

  const [cashCountedInput, setCashCountedInput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  // Propinas que el cajero lee y captura de la terminal al cerrar.
  const [tipsTerminalInput, setTipsTerminalInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CashReconciliationRow | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const loadMovements = useCallback(async () => {
    const { data } = await supabase
      .from("cash_movements")
      .select("id,date,kind,amount,reason,created_at")
      .eq("date", date)
      .order("created_at", { ascending: true });
    setMovements(
      ((data ?? []) as CashMovementRow[]).map((m) => ({
        ...m,
        amount: Number(m.amount),
      })),
    );
  }, [supabase, date]);

  const loadDay = useCallback(async () => {
    setError(null);
    setLoading(true);
    setSaved(null);
    setJustSaved(false);
    try {
      const totals = await fetchDayPaymentTotals(supabase, date);
      setCashSystem(totals.cashSystem);
      setCardSystem(totals.cardSystem);
      setTipsSystem(totals.tipsSystem);
      setOrdersWithoutMethod(totals.ordersWithoutMethod);

      // Fondo objetivo (admin). Si no existe, usa el default.
      const { data: fund } = await supabase
        .from("app_settings")
        .select("num_value")
        .eq("key", "cash_fund_target")
        .maybeSingle();
      setOpeningFloat(
        fund?.num_value == null
          ? DEFAULT_OPENING_FLOAT
          : Number(fund.num_value),
      );

      await loadMovements();

      const { data: existing, error: exErr } = await supabase
        .from("cash_reconciliation")
        .select("*")
        .eq("date", date)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);

      if (existing) {
        setSaved(mapRow(existing));
        setCashCountedInput(
          existing.cash_counted == null ? "" : String(existing.cash_counted),
        );
        setTerminalInput(String(existing.terminal_total));
        setTipsTerminalInput(
          existing.tips_total == null
            ? String(totals.tipsSystem || "")
            : String(existing.tips_total),
        );
        setNotesInput(existing.notes ?? "");
      } else {
        setCashCountedInput("");
        setTerminalInput("");
        setTipsTerminalInput(totals.tipsSystem ? String(totals.tipsSystem) : "");
        setNotesInput("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
      setCashSystem(0);
      setCardSystem(0);
      setTipsSystem(0);
      setOrdersWithoutMethod(0);
    } finally {
      setLoading(false);
    }
  }, [supabase, date, loadMovements]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  const withdrawals = useMemo(
    () =>
      Math.round(
        movements
          .filter((m) => m.kind === "retiro")
          .reduce((s, m) => s + m.amount, 0) * 100,
      ) / 100,
    [movements],
  );
  const deposits = useMemo(
    () =>
      Math.round(
        movements
          .filter((m) => m.kind === "abono")
          .reduce((s, m) => s + m.amount, 0) * 100,
      ) / 100,
    [movements],
  );

  // Efectivo esperado = fondo + ventas efectivo + abonos − retiros.
  const expectedCash = useMemo(
    () =>
      Math.round(
        (openingFloat + cashSystem + deposits - withdrawals) * 100,
      ) / 100,
    [openingFloat, cashSystem, deposits, withdrawals],
  );

  const cashCounted = useMemo(() => {
    const n = Number(cashCountedInput);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [cashCountedInput]);

  const cashDiff = useMemo(
    () => Math.round((cashCounted - expectedCash) * 100) / 100,
    [cashCounted, expectedCash],
  );

  const toDeposit = useMemo(
    () => Math.round((cashCounted - openingFloat) * 100) / 100,
    [cashCounted, openingFloat],
  );

  const actualTerminal = useMemo(() => {
    const n = Number(terminalInput);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [terminalInput]);

  // Propinas de la terminal capturadas por el cajero (lo que se guarda).
  const tipsTerminal = useMemo(() => {
    const n = Number(tipsTerminalInput);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }, [tipsTerminalInput]);

  const cardDiff = useMemo(
    () => Math.round((actualTerminal - cardSystem) * 100) / 100,
    [actualTerminal, cardSystem],
  );

  const hasCash = cashCountedInput.trim() !== "";
  const hasCard = terminalInput.trim() !== "";
  const cashMatches = hasCash && Math.abs(cashDiff) <= TOLERANCE;
  const cardMatches = hasCard && Math.abs(cardDiff) <= TOLERANCE;
  const allMatch = cashMatches && cardMatches;
  const showNotes = (hasCash && !cashMatches) || (hasCard && !cardMatches);

  async function addMovement() {
    const amt = Number(movAmount);
    if (!(amt > 0)) {
      setError("El monto del movimiento debe ser mayor que cero.");
      return;
    }
    setMovBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from("cash_movements").insert({
      date,
      kind: movKind,
      amount: Math.round(amt * 100) / 100,
      reason: movReason.trim() || null,
    });
    setMovBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setMovAmount("");
    setMovReason("");
    setJustSaved(false);
    await loadMovements();
  }

  async function removeMovement(id: string) {
    setError(null);
    const { error: delErr } = await supabase
      .from("cash_movements")
      .delete()
      .eq("id", id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    setJustSaved(false);
    await loadMovements();
  }

  async function saveReconciliation() {
    if (!hasCard) {
      setError("Ingresa el monto del terminal de tarjeta.");
      return;
    }
    if (!hasCash) {
      setError("Ingresa el efectivo contado en caja.");
      return;
    }
    setSaving(true);
    setError(null);

    const row = {
      date,
      cash_total: cashSystem,
      system_total: cardSystem,
      terminal_total: actualTerminal,
      difference: cardDiff,
      opening_float: openingFloat,
      cash_counted: cashCounted,
      cash_difference: cashDiff,
      cash_withdrawals: withdrawals,
      cash_deposits: deposits,
      tips_total: tipsTerminal,
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
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 py-4">
      <div>
        <h2 className="text-xl font-bold text-rondaCream">Cierre de caja</h2>
        <p className="mt-1 text-sm text-muted">
          Cuadra el efectivo (con fondo) y la tarjeta del día contra el sistema.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted2">
          Fecha del cierre
        </span>
        <span className="nums text-sm font-bold text-rondaCream">{date}</span>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-transparent p-3 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted">Cargando…</p>
      ) : (
        <>
          {/* Confirmación: corte ya generado */}
          {saved ? (
            <div
              className="rounded-2xl border-2 p-4"
              style={{ borderColor: "var(--ok)", background: "var(--ok-soft)" }}
            >
              <div className="flex items-center gap-2">
                <StatusBadge tone="ok" label="Corte del día generado" />
                {justSaved ? (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--ok)" }}
                  >
                    Guardado ✓
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted">Efectivo esperado</span>
                <span className="nums text-right text-rondaCream">
                  {money(saved.opening_float ?? openingFloat)} + ventas
                </span>
                <span className="text-muted">Efectivo contado</span>
                <span className="nums text-right font-semibold text-rondaCream">
                  {saved.cash_counted == null ? "—" : money(saved.cash_counted)}
                </span>
                <span className="text-muted">Diferencia efectivo</span>
                <span
                  className="nums text-right font-semibold"
                  style={{
                    color:
                      saved.cash_difference != null &&
                      Math.abs(saved.cash_difference) > TOLERANCE
                        ? "var(--danger)"
                        : "var(--ok)",
                  }}
                >
                  {saved.cash_difference == null
                    ? "—"
                    : `${saved.cash_difference > 0 ? "+" : ""}${money(saved.cash_difference)}`}
                </span>
                <span className="text-muted">Diferencia tarjeta</span>
                <span
                  className="nums text-right font-semibold"
                  style={{
                    color:
                      Math.abs(saved.difference) > TOLERANCE
                        ? "var(--danger)"
                        : "var(--ok)",
                  }}
                >
                  {`${saved.difference > 0 ? "+" : ""}${money(saved.difference)}`}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted">
                Puedes corregir los montos abajo y volver a guardar; se
                actualiza el corte de hoy.
              </p>
            </div>
          ) : null}

          {ordersWithoutMethod > 0 ? (
            <div
              className="rounded-xl border border-transparent p-3 text-sm"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              Hay {ordersWithoutMethod} pedido(s) sin método de pago; no entran
              en los totales de efectivo/tarjeta.
            </div>
          ) : null}

          {/* Ventas del día (sistema) */}
          <Card className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">
              Ventas del día (sistema)
            </p>
            <div className="flex justify-between text-sm text-muted">
              <span>Efectivo</span>
              <span className="nums font-semibold" style={{ color: "var(--ok)" }}>
                {money(cashSystem)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted">
              <span>Tarjeta</span>
              <span className="nums font-semibold" style={{ color: "var(--teal)" }}>
                {money(cardSystem)}
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-sm text-muted">
              <span>Propinas (estimado por sistema)</span>
              <span className="nums font-semibold" style={{ color: "var(--brand)" }}>
                {money(tipsSystem)}
              </span>
            </div>
            <p className="text-xs text-muted2">
              Referencia. El total que se guarda es el que capturas de la
              terminal más abajo.
            </p>
          </Card>

          {/* Movimientos de caja (retiros / abonos) */}
          <Card className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">
              Retiros y abonos de caja
            </p>
            <p className="text-xs text-muted2">
              Retiro = sacas efectivo de la caja. Abono = metes efectivo. Ajustan
              el efectivo esperado.
            </p>

            {movements.length > 0 ? (
              <ul className="space-y-2">
                {movements.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            m.kind === "retiro" ? "var(--danger)" : "var(--ok)",
                        }}
                      >
                        {m.kind === "retiro" ? "Retiro" : "Abono"}
                      </span>
                      {m.reason ? (
                        <span className="text-muted"> · {m.reason}</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className="nums font-semibold"
                        style={{
                          color:
                            m.kind === "retiro" ? "var(--danger)" : "var(--ok)",
                        }}
                      >
                        {m.kind === "retiro" ? "−" : "+"}
                        {money(m.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeMovement(m.id)}
                        className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface3"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted2">Sin movimientos hoy.</p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted2">Tipo</label>
                <select
                  value={movKind}
                  onChange={(e) =>
                    setMovKind(e.target.value === "abono" ? "abono" : "retiro")
                  }
                  className={cn(inputCls, "h-10 w-28")}
                >
                  <option value="retiro">Retiro</option>
                  <option value="abono">Abono</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted2">Monto $</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  placeholder="0.00"
                  className={cn(inputCls, "nums h-10 w-28")}
                />
              </div>
              <div className="min-w-[8rem] flex-1">
                <label className="mb-1 block text-xs text-muted2">Motivo</label>
                <input
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  placeholder="Ej. cambio, pago proveedor"
                  className={cn(inputCls, "h-10")}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => void addMovement()}
                disabled={movBusy}
              >
                Agregar
              </Button>
            </div>
          </Card>

          {/* Arqueo de efectivo */}
          <Card className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">
              Efectivo (arqueo)
            </p>
            <div className="flex justify-between rounded-xl bg-surface2 px-3 py-2 text-sm">
              <span className="text-muted">Fondo (definido por admin)</span>
              <span className="nums font-semibold text-rondaCream">
                {money(openingFloat)}
              </span>
            </div>
            {(withdrawals > 0 || deposits > 0) ? (
              <div className="flex justify-between rounded-xl bg-surface2 px-3 py-2 text-sm">
                <span className="text-muted">Abonos − retiros</span>
                <span className="nums font-semibold text-rondaCream">
                  {deposits - withdrawals >= 0 ? "+" : "−"}
                  {money(Math.abs(deposits - withdrawals))}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between rounded-xl bg-surface2 px-3 py-2 text-sm">
              <span className="text-muted">Efectivo esperado en caja</span>
              <span className="nums font-semibold text-rondaCream">
                {money(expectedCash)}
              </span>
            </div>
            <Field label="Efectivo contado en caja">
              <input
                type="number"
                min={0}
                step={0.01}
                value={cashCountedInput}
                onChange={(e) => setCashCountedInput(e.target.value)}
                placeholder="0.00"
                className={cn(inputCls, "h-12 text-lg font-semibold nums")}
              />
            </Field>
            {hasCash ? (
              <div
                className="rounded-xl border-2 p-3 text-center"
                style={{
                  borderColor: cashMatches ? "var(--ok)" : "var(--danger)",
                  background: cashMatches ? "var(--ok-soft)" : "var(--danger-soft)",
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <StatusBadge
                    tone={cashMatches ? "ok" : "danger"}
                    label={cashMatches ? "Efectivo cuadra" : "Diferencia de efectivo"}
                  />
                </div>
                {!cashMatches ? (
                  <p
                    className="nums mt-2 text-2xl font-black"
                    style={{ color: "var(--danger)" }}
                  >
                    {cashDiff > 0 ? "+" : ""}
                    {money(cashDiff)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  A depositar (ventas efectivo): {money(toDeposit)} · el fondo{" "}
                  {money(openingFloat)} se queda en caja
                </p>
              </div>
            ) : null}
          </Card>

          {/* Tarjeta */}
          <Card className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">
              Tarjeta (terminal)
            </p>
            <Field label="Monto real del terminal">
              <input
                type="number"
                min={0}
                step={0.01}
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder="0.00"
                className={cn(inputCls, "h-12 text-lg font-semibold nums")}
              />
            </Field>
            <Field label="Propinas de la terminal">
              <input
                type="number"
                min={0}
                step={0.01}
                value={tipsTerminalInput}
                onChange={(e) => setTipsTerminalInput(e.target.value)}
                placeholder="0.00"
                className={cn(inputCls, "h-12 text-lg font-semibold nums")}
              />
            </Field>
            <p className="text-xs text-muted2">
              Escribe el total de propinas que reporta la terminal al cerrar. El
              sistema estima {money(tipsSystem)}; ajústalo al número real.
            </p>
            {hasCard ? (
              <div
                className="rounded-xl border-2 p-3 text-center"
                style={{
                  borderColor: cardMatches ? "var(--ok)" : "var(--danger)",
                  background: cardMatches ? "var(--ok-soft)" : "var(--danger-soft)",
                }}
              >
                <StatusBadge
                  tone={cardMatches ? "ok" : "danger"}
                  label={cardMatches ? "Tarjeta cuadra" : "Diferencia de tarjeta"}
                />
                {!cardMatches ? (
                  <p
                    className="nums mt-2 text-2xl font-black"
                    style={{ color: "var(--danger)" }}
                  >
                    {cardDiff > 0 ? "+" : ""}
                    {money(cardDiff)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          {/* Estado combinado */}
          {hasCash && hasCard ? (
            <div
              className="rounded-2xl border-2 p-4 text-center"
              style={{
                borderColor: allMatch ? "var(--ok)" : "var(--warn)",
                background: allMatch ? "var(--ok-soft)" : "var(--warn-soft)",
              }}
            >
              <p
                className="text-lg font-bold"
                style={{ color: allMatch ? "var(--ok)" : "var(--warn)" }}
              >
                {allMatch ? "Todo cuadra ✓" : "Revisa las diferencias"}
              </p>
            </div>
          ) : null}

          {showNotes ? (
            <Field label="Notas para explicar la diferencia">
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                rows={3}
                placeholder="Ej. billete roto, error al cobrar, cliente pagó de más"
                className={cn(inputCls, "h-auto py-2")}
              />
            </Field>
          ) : null}

          <Button
            variant="primary"
            className="h-12 w-full text-base"
            disabled={saving || !hasCard || !hasCash}
            onClick={() => void saveReconciliation()}
          >
            {saving
              ? "Guardando…"
              : saved
                ? "Actualizar corte del día"
                : "Guardar cierre del día"}
          </Button>
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
    opening_float: r.opening_float == null ? null : Number(r.opening_float),
    cash_counted: r.cash_counted == null ? null : Number(r.cash_counted),
    cash_difference: r.cash_difference == null ? null : Number(r.cash_difference),
    cash_withdrawals:
      r.cash_withdrawals == null ? null : Number(r.cash_withdrawals),
    cash_deposits: r.cash_deposits == null ? null : Number(r.cash_deposits),
    tips_total: r.tips_total == null ? null : Number(r.tips_total),
    notes: (r.notes as string | null) ?? null,
  };
}
