"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  ACCOUNTING_CATEGORIES,
  BASE_UNIT_OPTIONS,
  INVENTORY_CATEGORIES,
  baseUnitLabel,
  measureLabel,
  type InventoryItem,
} from "@/modules/inventory/types";

const ITEM_COLUMNS =
  "id,name,category,sort_order,active,base_unit,min_stock,current_cost,current_stock,yield_pct,count_tolerance_pct,accounting_category,pack_size";

type ItemPatch = Partial<
  Pick<
    InventoryItem,
    | "name"
    | "category"
    | "base_unit"
    | "min_stock"
    | "yield_pct"
    | "accounting_category"
    | "pack_size"
  >
>;

export default function OwnerInventoryClient() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fName, setFName] = useState("");
  const [fCategory, setFCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [fBaseUnit, setFBaseUnit] = useState<string>("g");
  const [fMin, setFMin] = useState("");
  const [fYield, setFYield] = useState("100");
  const [fAccounting, setFAccounting] = useState<string>("Costo de venta");
  const [fPack, setFPack] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const { data, error: qErr } = await supabase
      .from("inventory_items")
      .select(ITEM_COLUMNS)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (qErr) {
      setError(qErr.message);
      setItems([]);
    } else {
      setItems((data ?? []) as InventoryItem[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const inventoryValue = useMemo(
    () =>
      items.reduce(
        (s, it) =>
          s + Number(it.current_stock ?? 0) * Number(it.current_cost ?? 0),
        0,
      ),
    [items],
  );

  async function saveItem(id: string, patch: ItemPatch) {
    setBusyId(id);
    setError(null);
    const { error: uErr } = await supabase
      .from("inventory_items")
      .update(patch)
      .eq("id", id);
    if (uErr) setError(uErr.message);
    setBusyId(null);
    void load();
  }

  async function deleteItem(it: InventoryItem) {
    if (!window.confirm(`¿Eliminar "${it.name}"? Esta acción no se puede deshacer.`))
      return;
    setBusyId(it.id);
    setError(null);
    const { error: dErr } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", it.id);
    setBusyId(null);
    if (dErr) {
      setError(
        `No se pudo eliminar "${it.name}": probablemente ya tiene compras o movimientos y se conserva para no romper el historial.`,
      );
      return;
    }
    void load();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const name = fName.trim();
    if (!name) {
      setError("El nombre es obligatorio.");
      return;
    }
    const maxInCat = items
      .filter((it) => it.category === fCategory)
      .reduce((m, it) => Math.max(m, it.sort_order), 0);
    setSaving(true);
    setError(null);
    const { error: insErr } = await supabase.from("inventory_items").insert({
      name,
      category: fCategory,
      sort_order: maxInCat + 10,
      base_unit: fBaseUnit,
      min_stock: Number(fMin) || 0,
      yield_pct: Number(fYield) || 100,
      accounting_category: fAccounting,
      pack_size: fBaseUnit === "pza" && fPack ? Number(fPack) : null,
    });
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setShowAdd(false);
    setFName("");
    setFMin("");
    setFYield("100");
    setFPack("");
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50">Materiales</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Catálogo maestro. Define el tipo de medida (Peso, Volumen o
            Unidades) de cada insumo; al comprar podrás registrar en la unidad
            que quieras (g o kg, ml o lt). La existencia y el costo se actualizan
            solos con las compras.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Valor de inventario
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rondaCream">
            ${inventoryValue.toFixed(2)}
          </p>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          + Agregar material
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[920px] text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Contable</th>
                <th className="px-3 py-2">Mide</th>
                <th className="px-3 py-2">Pzas/paq</th>
                <th className="px-3 py-2">Mínimo</th>
                <th className="px-3 py-2">Yield %</th>
                <th className="px-3 py-2 text-right">Existencia</th>
                <th className="px-3 py-2 text-right">Costo/u</th>
                <th className="px-3 py-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const unit = baseUnitLabel(it.base_unit);
                return (
                  <tr key={it.id} className="border-b border-zinc-800/60">
                    <td className="px-3 py-2">
                      <input
                        defaultValue={it.name}
                        disabled={busyId === it.id}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== it.name) void saveItem(it.id, { name: v });
                        }}
                        className="h-10 w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.category}
                        disabled={busyId === it.id}
                        onChange={(e) =>
                          void saveItem(it.id, { category: e.target.value })
                        }
                        className="h-10 w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                      >
                        {[
                          ...INVENTORY_CATEGORIES,
                          ...((INVENTORY_CATEGORIES as readonly string[]).includes(
                            it.category,
                          )
                            ? []
                            : [it.category]),
                        ].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.accounting_category ?? "Costo de venta"}
                        disabled={busyId === it.id}
                        onChange={(e) =>
                          void saveItem(it.id, {
                            accounting_category: e.target.value,
                          })
                        }
                        className="h-10 w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                      >
                        {ACCOUNTING_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.base_unit ?? ""}
                        disabled={busyId === it.id}
                        onChange={(e) =>
                          void saveItem(it.id, { base_unit: e.target.value })
                        }
                        className="h-10 w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                      >
                        <option value="">—</option>
                        {BASE_UNIT_OPTIONS.map((u) => (
                          <option key={u.code} value={u.code}>
                            {measureLabel(u.code)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {it.base_unit === "pza" ? (
                        <input
                          type="number"
                          defaultValue={it.pack_size ?? ""}
                          disabled={busyId === it.id}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const n = raw === "" ? null : Number(raw);
                            if (n !== (it.pack_size ?? null))
                              void saveItem(it.id, { pack_size: n });
                          }}
                          placeholder="—"
                          className="h-10 w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                        />
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={it.min_stock ?? 0}
                        disabled={busyId === it.id}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n !== (it.min_stock ?? 0))
                            void saveItem(it.id, { min_stock: n });
                        }}
                        className="h-10 w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={it.yield_pct ?? 100}
                        disabled={busyId === it.id}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n !== (it.yield_pct ?? 100))
                            void saveItem(it.id, { yield_pct: n });
                        }}
                        className="h-10 w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                      {Number(it.current_stock ?? 0).toLocaleString("es-MX", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-zinc-500">{unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                      ${Number(it.current_cost ?? 0).toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        disabled={busyId === it.id}
                        onClick={() => void deleteItem(it)}
                        className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/60 disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/60"
            onClick={() => !saving && setShowAdd(false)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-50">Nuevo material</h3>
            <form onSubmit={addItem} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Nombre</label>
                <input
                  required
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  placeholder="Ej. Queso mozzarella"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Categoría</label>
                <select
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                >
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Categoría contable
                </label>
                <select
                  value={fAccounting}
                  onChange={(e) => setFAccounting(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                >
                  {ACCOUNTING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Tipo de medida
                </label>
                <select
                  value={fBaseUnit}
                  onChange={(e) => setFBaseUnit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                >
                  {BASE_UNIT_OPTIONS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              {fBaseUnit === "pza" ? (
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Piezas por paquete (opcional, si compras por caja/paquete)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={fPack}
                    onChange={(e) => setFPack(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    placeholder="Ej. 100"
                  />
                </div>
              ) : null}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">
                    Mínimo
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={fMin}
                    onChange={(e) => setFMin(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                    placeholder="0"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-zinc-500">
                    Yield %
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={fYield}
                    onChange={(e) => setFYield(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
