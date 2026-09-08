"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  ACCOUNTING_CATEGORIES,
  BASE_UNIT_OPTIONS,
  INVENTORY_CATEGORIES,
  baseUnitLabel,
  measureLabel,
  purchaseUnitsFor,
  type InventoryItem,
} from "@/modules/inventory/types";

import { exportExpensesToExcel } from "./lib/exportExpensesExcel";
import { rangeForPreset, toLocalYmd, type LocalDateRange } from "./lib/dateRange";
import type { ExpensePeriodPreset, ExpenseRow } from "./types";

function normalizeYmd(raw: string): string {
  return raw.trim().slice(0, 10);
}
function isValidYmd(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeYmd(raw));
}
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

type ModalMode = "gasto" | "compra" | null;

type Concept = {
  id: string;
  name: string;
  accounting_category: string;
  is_payroll: boolean;
};
type Employee = { id: string; name: string };

const PRESET_LABELS: Record<Exclude<ExpensePeriodPreset, "custom">, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
  prevMonth: "Mes anterior",
};

export default function ExpensesManagementClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => toLocalYmd(new Date()), []);
  const [preset, setPreset] = useState<ExpensePeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [modal, setModal] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);

  // Gasto general
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [formCategory, setFormCategory] = useState("Gasto de operación");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => toLocalYmd(new Date()));
  const [gConcept, setGConcept] = useState<string>("");
  const [gEmployee, setGEmployee] = useState<string>("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Compra de insumo
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cItem, setCItem] = useState("");
  const [cQty, setCQty] = useState("");
  const [cUnit, setCUnit] = useState("");
  const [cTotal, setCTotal] = useState("");
  const [cSupplier, setCSupplier] = useState("");
  const [cDate, setCDate] = useState(() => toLocalYmd(new Date()));

  // Alta rápida de ingrediente (dentro de compra)
  const [showNewIng, setShowNewIng] = useState(false);
  const [niName, setNiName] = useState("");
  const [niCategory, setNiCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [niBaseUnit, setNiBaseUnit] = useState("g");
  const [niAccounting, setNiAccounting] = useState<string>("Costo de venta");
  const [niSaving, setNiSaving] = useState(false);

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

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("id,name,category,sort_order,active,base_unit")
      .eq("active", true)
      .order("name", { ascending: true });
    setItems((data ?? []) as InventoryItem[]);
  }, [supabase]);

  const loadConcepts = useCallback(async () => {
    const { data } = await supabase
      .from("expense_concepts")
      .select("id,name,accounting_category,is_payroll")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    setConcepts((data ?? []) as Concept[]);
  }, [supabase]);

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("employees")
      .select("id,name")
      .eq("active", true)
      .order("name", { ascending: true });
    setEmployees((data ?? []) as Employee[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadExpenses();
      setLoading(false);
    })();
  }, [loadExpenses]);

  useEffect(() => {
    void loadItems();
    void loadConcepts();
    void loadEmployees();
  }, [loadItems, loadConcepts, loadEmployees]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
    return copy;
  }, [rows, sortAsc]);

  const total = useMemo(
    () => sortedRows.reduce((s, r) => s + r.amount, 0),
    [sortedRows],
  );

  const selectedItem = useMemo(
    () => items.find((it) => it.id === cItem),
    [items, cItem],
  );
  const selectedConcept = useMemo(
    () => concepts.find((c) => c.id === gConcept),
    [concepts, gConcept],
  );
  const unitOptions = useMemo(
    () =>
      [...purchaseUnitsFor(selectedItem?.base_unit)].sort(
        (a, b) => b.to_base_factor - a.to_base_factor,
      ),
    [selectedItem],
  );
  useEffect(() => {
    if (!selectedItem) {
      setCUnit("");
      return;
    }
    const opts = [...purchaseUnitsFor(selectedItem.base_unit)].sort(
      (a, b) => b.to_base_factor - a.to_base_factor,
    );
    if (!opts.some((u) => u.code === cUnit)) {
      setCUnit(opts[0]?.code ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cItem]);

  const compraTotal = useMemo(
    () => Math.round((Number(cTotal) || 0) * 100) / 100,
    [cTotal],
  );
  const unitCostPreview = useMemo(() => {
    const q = Number(cQty) || 0;
    const t = Number(cTotal) || 0;
    return q > 0 ? t / q : 0;
  }, [cQty, cTotal]);

  function openGasto() {
    setEditing(null);
    setGConcept("");
    setGEmployee("");
    setFormCategory("Gasto de operación");
    setFormDescription("");
    setFormAmount("");
    setFormDate(toLocalYmd(new Date()));
    setError(null);
    setModal("gasto");
  }
  function openEdit(row: ExpenseRow) {
    setEditing(row);
    setGConcept("otro");
    setGEmployee("");
    setFormCategory(row.category);
    setFormDescription(row.description);
    setFormAmount(String(row.amount));
    setFormDate(row.date);
    setError(null);
    setModal("gasto");
  }
  function openCompra() {
    setCItem("");
    setCQty("");
    setCTotal("");
    setCSupplier("");
    setCDate(toLocalYmd(new Date()));
    setShowNewIng(false);
    setError(null);
    setModal("compra");
  }
  function closeModal() {
    if (saving) return;
    setModal(null);
    setEditing(null);
  }

  async function submitGasto(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.round((Number(formAmount) || 0) * 100) / 100;
    const dateYmd = normalizeYmd(formDate);
    if (amount <= 0) {
      setError("El importe debe ser mayor que cero.");
      return;
    }
    if (!isValidYmd(dateYmd)) {
      setError("Selecciona una fecha válida.");
      return;
    }

    let category: string;
    let description: string;
    const freeMode = editing !== null || gConcept === "otro";
    if (freeMode) {
      if (!formDescription.trim()) {
        setError("La descripción es obligatoria.");
        return;
      }
      category = formCategory;
      description = formDescription.trim();
    } else {
      if (!gConcept) {
        setError("Elige un concepto.");
        return;
      }
      const c = selectedConcept;
      if (!c) {
        setError("Concepto inválido.");
        return;
      }
      category = c.accounting_category;
      description = c.name;
      if (c.is_payroll) {
        const emp = employees.find((x) => x.id === gEmployee);
        if (!emp) {
          setError("Elige el trabajador.");
          return;
        }
        description = `${c.name} — ${emp.name}`;
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const { error: uErr } = await supabase
          .from("expenses")
          .update({ category, description, amount, date: dateYmd })
          .eq("id", editing.id);
        if (uErr) {
          setError(uErr.message);
          return;
        }
      } else {
        const { error: iErr } = await supabase
          .from("expenses")
          .insert({ category, description, amount, date: dateYmd });
        if (iErr) {
          setError(iErr.message);
          return;
        }
      }
      setModal(null);
      setEditing(null);
      setOk("Gasto guardado.");
      await loadExpenses();
    } finally {
      setSaving(false);
    }
  }

  async function submitCompra(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!cItem) {
      setError("Elige un ingrediente.");
      return;
    }
    if (!selectedItem?.base_unit) {
      setError("Ese ingrediente no tiene unidad base. Ponle una en Ingredientes.");
      return;
    }
    const q = Number(cQty);
    const t = Number(cTotal);
    if (!(q > 0)) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (!(t >= 0)) {
      setError("El costo total no puede ser negativo.");
      return;
    }
    if (!cUnit) {
      setError("Elige la unidad de compra.");
      return;
    }
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc("apply_purchase", {
      p_item_id: cItem,
      p_purchase_qty: q,
      p_purchase_unit: cUnit,
      p_total_cost: t,
      p_supplier: cSupplier.trim() || null,
      p_purchased_at: normalizeYmd(cDate),
      p_notes: null,
      p_create_expense: true,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setModal(null);
    setOk(
      `Compra registrada: ${selectedItem.name} · $${compraTotal.toFixed(2)} (entró a inventario y a gastos).`,
    );
    await Promise.all([loadExpenses(), loadItems()]);
  }

  async function addIngredientInline(e: React.FormEvent) {
    e.preventDefault();
    const name = niName.trim();
    if (!name) return;
    setNiSaving(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from("inventory_items")
      .insert({
        name,
        category: niCategory,
        base_unit: niBaseUnit,
        accounting_category: niAccounting,
        sort_order: 999,
      })
      .select("id,name,category,sort_order,active,base_unit")
      .single();
    setNiSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setShowNewIng(false);
    setNiName("");
    await loadItems();
    if (data) setCItem((data as InventoryItem).id);
  }

  async function removeRow(id: string) {
    if (!window.confirm("¿Eliminar este registro?")) return;
    setError(null);
    const { error: delErr } = await supabase.from("expenses").delete().eq("id", id);
    if (delErr) setError(delErr.message);
    else await loadExpenses();
  }

  function exportExcel() {
    exportExpensesToExcel(sortedRows, `${range.from}_a_${range.to}`);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-sm text-emerald-200">
          {ok}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Total del período
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {range.from === range.to ? range.from : `${range.from} — ${range.to}`}
            </p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-rondaCream">
              ${total.toFixed(2)}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {sortedRows.length} registro{sortedRows.length === 1 ? "" : "s"}
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
                    ? "h-11 rounded-lg bg-rondaAccent px-4 text-sm font-bold text-rondaCream"
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
                  ? "h-11 rounded-lg bg-rondaAccent px-4 text-sm font-bold text-rondaCream"
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
                className="input-date-dark h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Hasta</label>
              <input
                type="date"
                value={customTo}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                className="input-date-dark h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openCompra}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          ＋ Compra (insumo)
        </button>
        <button
          type="button"
          onClick={openGasto}
          className="h-11 rounded-lg bg-rondaAccent px-5 text-sm font-bold text-rondaCream hover:bg-rondaAccentHover"
        >
          ＋ Gasto
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
            No hay registros en este período.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => setSortAsc((v) => !v)}
                    className="font-semibold text-zinc-400 hover:text-rondaCream"
                  >
                    Fecha {sortAsc ? "↑" : "↓"}
                  </button>
                </th>
                <th className="px-4 py-3 text-center font-semibold">Categoría</th>
                <th className="px-4 py-3 text-center font-semibold">Descripción</th>
                <th className="px-4 py-3 text-right font-semibold">Importe</th>
                <th className="px-4 py-3 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const isCompra = r.description.startsWith("Compra:");
                return (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-800/80 bg-zinc-950/40 hover:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums text-zinc-300">
                      {r.date}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-zinc-300">{r.category}</span>
                      {isCompra ? (
                        <span className="ml-2 rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                          compra
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-center text-zinc-300">
                      {r.description}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-rondaCream">
                      ${r.amount.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        {isCompra ? (
                          <span className="text-xs text-zinc-600">
                            (desde compra)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="text-rondaCream hover:underline"
                          >
                            Editar
                          </button>
                        )}
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
                );
              })}
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
          <div className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-50">
              {modal === "compra"
                ? "Registrar compra"
                : editing
                  ? "Editar gasto"
                  : "Registrar gasto"}
            </h3>

            {modal === "compra" ? (
              <form onSubmit={submitCompra} className="mt-4 space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs text-zinc-500">Material</label>
                    <button
                      type="button"
                      onClick={() => setShowNewIng((v) => !v)}
                      className="text-xs font-semibold text-emerald-400 hover:underline"
                    >
                      {showNewIng ? "Cancelar" : "＋ nuevo"}
                    </button>
                  </div>
                  {showNewIng ? (
                    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                      <input
                        value={niName}
                        onChange={(e) => setNiName(e.target.value)}
                        placeholder="Nombre del material"
                        className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
                      />
                      <div className="flex gap-2">
                        <select
                          value={niCategory}
                          onChange={(e) => setNiCategory(e.target.value)}
                          className="h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                        >
                          {INVENTORY_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <select
                          value={niBaseUnit}
                          onChange={(e) => setNiBaseUnit(e.target.value)}
                          className="h-10 w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                        >
                          {BASE_UNIT_OPTIONS.map((u) => (
                            <option key={u.code} value={u.code}>
                              {measureLabel(u.code)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <select
                        value={niAccounting}
                        onChange={(e) => setNiAccounting(e.target.value)}
                        className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                      >
                        {ACCOUNTING_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => void addIngredientInline(e)}
                        disabled={niSaving}
                        className="h-10 w-full rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {niSaving ? "Guardando…" : "Agregar y usar"}
                      </button>
                    </div>
                  ) : (
                    <select
                      value={cItem}
                      onChange={(e) => setCItem(e.target.value)}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    >
                      <option value="">— Elige —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                          {it.base_unit
                            ? ` (${baseUnitLabel(it.base_unit)})`
                            : " (sin unidad)"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-3">
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-zinc-500">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={cQty}
                      onChange={(e) => setCQty(e.target.value)}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-zinc-500">
                      Unidad
                    </label>
                    <select
                      value={cUnit}
                      onChange={(e) => setCUnit(e.target.value)}
                      disabled={!selectedItem}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-zinc-100 disabled:opacity-50"
                    >
                      {unitOptions.length === 0 ? <option value="">—</option> : null}
                      {unitOptions.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-zinc-500">
                      Costo total de la orden ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={cTotal}
                      onChange={(e) => setCTotal(e.target.value)}
                      placeholder="Lo que pagaste"
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <span className="text-xs uppercase text-zinc-500">
                    Costo por {cUnit || "unidad"} (calculado)
                  </span>
                  <span className="font-bold tabular-nums text-rondaCream">
                    ${unitCostPreview.toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-zinc-500">
                      Proveedor (opcional)
                    </label>
                    <input
                      value={cSupplier}
                      onChange={(e) => setCSupplier(e.target.value)}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    />
                  </div>
                  <div className="w-40">
                    <label className="mb-1 block text-xs text-zinc-500">Fecha</label>
                    <input
                      type="date"
                      value={cDate}
                      max={today}
                      onChange={(e) => setCDate(e.target.value)}
                      className="input-date-dark h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    />
                  </div>
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
                    className="h-11 flex-1 rounded-lg bg-emerald-600 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saving ? "Guardando…" : "Registrar compra"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitGasto} className="mt-4 space-y-4">
                {!editing ? (
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Concepto
                    </label>
                    <select
                      value={gConcept}
                      onChange={(e) => {
                        setGConcept(e.target.value);
                        setGEmployee("");
                      }}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    >
                      <option value="">— Elige —</option>
                      {concepts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="otro">Otro (libre)</option>
                    </select>
                  </div>
                ) : null}

                {!editing && selectedConcept?.is_payroll ? (
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Trabajador
                    </label>
                    <select
                      value={gEmployee}
                      onChange={(e) => setGEmployee(e.target.value)}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    >
                      <option value="">— Elige —</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                    {employees.length === 0 ? (
                      <p className="mt-1 text-xs text-amber-400">
                        No hay trabajadores. Agrégalos en Catálogos → Trabajadores.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {editing || gConcept === "otro" ? (
                  <>
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
                        !(ACCOUNTING_CATEGORIES as readonly string[]).includes(
                          editing.category,
                        ) ? (
                          <option value={editing.category}>
                            {editing.category}
                          </option>
                        ) : null}
                        {ACCOUNTING_CATEGORIES.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Descripción
                      </label>
                      <input
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                        placeholder="Ej. Recibo CFE agosto"
                      />
                    </div>
                  </>
                ) : null}

                <div className="flex gap-3">
                  <div className="flex-1">
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
                  <div className="w-44">
                    <label className="mb-1 block text-xs text-zinc-500">
                      Fecha
                    </label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="input-date-dark h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    />
                  </div>
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
                    className="h-11 flex-1 rounded-lg bg-rondaAccent font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
