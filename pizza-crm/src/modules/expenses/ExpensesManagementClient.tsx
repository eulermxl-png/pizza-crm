"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { EXPENSE_CATEGORIES } from "./constants";
import { exportExpensesToExcel } from "./lib/exportExpensesExcel";
import { rangeForPreset, toLocalYmd, type LocalDateRange } from "./lib/dateRange";
import type { ExpensePeriodPreset, ExpenseRow } from "./types";

function mapFromDb(row: {
  id: string;
  category: string;
  description: string;
  amount: number | string;
  date: string;
}): ExpenseRow {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    date: row.date,
  };
}

type ModalMode = "add" | "edit" | null;

const PRESET_LABELS: Record<Exclude<ExpensePeriodPreset, "custom">, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
};

export default function ExpensesManagementClient() {
  const supabase = useMemo(() => createClient(), []);
  const [preset, setPreset] = useState<ExpensePeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(() => toLocalYmd(new Date()));
  const [customTo, setCustomTo] = useState(() => toLocalYmd(new Date()));
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [modal, setModal] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [formCategory, setFormCategory] = useState("Otros");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => toLocalYmd(new Date()));

  const range: LocalDateRange = useMemo(() => {
    if (preset === "custom") {
      const a = customFrom <= customTo ? customFrom : customTo;
      const b = customFrom <= customTo ? customTo : customFrom;
      return { from: a, to: b };
    }
    return rangeForPreset(preset);
  }, [preset, customFrom, customTo]);

  const loadExpenses = useCallback(async () => {
    setError(null);
    const { data, error: qErr } = await supabase
      .from("expenses")
      .select("id, category, description, amount, date")
      .gte("date", range.from)
      .lte("date", range.to)
      .order("date", { ascending: false });

    if (qErr) {
      setError(qErr.message);
      setRows([]);
      return;
    }

    setRows((data ?? []).map(mapFromDb));
  }, [supabase, range.from, range.to]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadExpenses();
      setLoading(false);
    })();
  }, [loadExpenses]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      sortAsc
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date),
    );
    return copy;
  }, [rows, sortAsc]);

  const total = useMemo(
    () => sortedRows.reduce((s, r) => s + r.amount, 0),
    [sortedRows],
  );

  function openAdd() {
    setEditing(null);
    setFormCategory("Otros");
    setFormDescription("");
    setFormAmount("");
    setFormDate(toLocalYmd(new Date()));
    setModal("add");
  }

  function openEdit(row: ExpenseRow) {
    setEditing(row);
    setFormCategory(row.category);
    setFormDescription(row.description);
    setFormAmount(String(row.amount));
    setFormDate(row.date);
    setModal("edit");
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setEditing(null);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.round((Number(formAmount) || 0) * 100) / 100;
    if (!formDescription.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    if (amount <= 0) {
      setError("El importe debe ser mayor que cero.");
      return;
    }

    const categoryAllowed =
      (EXPENSE_CATEGORIES as readonly string[]).includes(formCategory) ||
      (modal === "edit" && editing?.category === formCategory);
    if (!categoryAllowed) {
      setError("Selecciona una categoría de la lista.");
      return;
    }

    setSaving(true);
    setError(null);

    let ok = false;
    if (modal === "add") {
      const { error: insErr } = await supabase.from("expenses").insert({
        category: formCategory,
        description: formDescription.trim(),
        amount,
        date: formDate,
      });
      if (insErr) setError(insErr.message);
      else ok = true;
    } else if (modal === "edit" && editing) {
      const { error: updErr } = await supabase
        .from("expenses")
        .update({
          category: formCategory,
          description: formDescription.trim(),
          amount,
          date: formDate,
        })
        .eq("id", editing.id);
      if (updErr) setError(updErr.message);
      else ok = true;
    }

    setSaving(false);
    if (ok) {
      closeModal();
      await loadExpenses();
    }
  }

  async function removeRow(id: string) {
    if (!window.confirm("¿Eliminar este gasto?")) return;
    setError(null);
    const { error: delErr } = await supabase.from("expenses").delete().eq("id", id);
    if (delErr) setError(delErr.message);
    else await loadExpenses();
  }

  function exportExcel() {
    exportExpensesToExcel(
      sortedRows,
      `${range.from}_a_${range.to}`,
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Resumen del período
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {range.from === range.to
                ? range.from
                : `${range.from} — ${range.to}`}
            </p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-orange-400">
              ${total.toFixed(2)}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {sortedRows.length} registro
              {sortedRows.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              Object.entries(PRESET_LABELS) as [
                Exclude<ExpensePeriodPreset, "custom">,
                string,
              ][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={
                  preset === key
                    ? "h-11 rounded-lg bg-orange-500 px-4 text-sm font-bold text-zinc-950"
                    : "h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
                }
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset("custom")}
              className={
                preset === "custom"
                  ? "h-11 rounded-lg bg-orange-500 px-4 text-sm font-bold text-zinc-950"
                  : "h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
              }
            >
              Rango
            </button>
          </div>
        </div>

        {preset === "custom" ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-800 pt-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Desde</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Hasta</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openAdd}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          Agregar gasto
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={sortedRows.length === 0}
          className="h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
        >
          Exportar Excel
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        {loading ? (
          <p className="p-8 text-center text-zinc-500">Cargando…</p>
        ) : sortedRows.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">
            No hay gastos en este período.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => setSortAsc((v) => !v)}
                    className="font-semibold text-zinc-400 hover:text-orange-400"
                  >
                    Fecha {sortAsc ? "↑" : "↓"}
                  </button>
                </th>
                <th className="px-4 py-3 text-center font-semibold">Categoría</th>
                <th className="px-4 py-3 text-center font-semibold">
                  Descripción
                </th>
                <th className="px-4 py-3 text-right font-semibold">Importe</th>
                <th className="px-4 py-3 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-zinc-800/80 bg-zinc-950/40 hover:bg-zinc-900/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums text-zinc-300">
                    {r.date}
                  </td>
                  <td className="px-4 py-3 text-center">{r.category}</td>
                  <td className="max-w-xs px-4 py-3 text-center text-zinc-300">
                    {r.description}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-orange-300">
                    ${r.amount.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <div
                      style={{
                        gap: "8px",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="text-orange-400 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeRow(r.id)}
                        className="text-red-400 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/60"
            onClick={closeModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-50">
              {modal === "add" ? "Nuevo gasto" : "Editar gasto"}
            </h3>
            <form onSubmit={submitForm} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Fecha</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Categoría
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                >
                  {editing &&
                  !(EXPENSE_CATEGORIES as readonly string[]).includes(
                    editing.category,
                  ) ? (
                    <option value={editing.category}>{editing.category}</option>
                  ) : null}
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Descripción
                </label>
                <input
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  placeholder="Ej. Compra de harina"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Importe ($)
                </label>
                <input
                  required
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-11 flex-1 rounded-lg border border-zinc-700 font-semibold text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 flex-1 rounded-lg bg-orange-500 font-bold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
