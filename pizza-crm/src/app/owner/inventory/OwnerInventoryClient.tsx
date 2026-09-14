"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  ACCOUNTING_CATEGORIES,
  BASE_UNIT_OPTIONS,
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
  const [fCategory, setFCategory] = useState<string>("");
  const [fBaseUnit, setFBaseUnit] = useState<string>("g");
  const [fMin, setFMin] = useState("");
  const [fYield, setFYield] = useState("100");
  const [fAccounting, setFAccounting] = useState<string>("Costo de venta");
  const [fPack, setFPack] = useState("");

  // Categorías de inventario (administrables desde aquí).
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [showCats, setShowCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const catNames = useMemo(() => categories.map((c) => c.name), [categories]);

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

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_categories")
      .select("id,name")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    const list = (data ?? []) as { id: string; name: string }[];
    setCategories(list);
    setFCategory((cur) => cur || (list[0]?.name ?? ""));
  }, [supabase]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true);
    setError(null);
    const { error: insErr } = await supabase
      .from("inventory_categories")
      .insert({ name });
    setCatBusy(false);
    if (insErr) {
      setError(
        insErr.code === "23505"
          ? "Ya existe una categoría con ese nombre."
          : insErr.message,
      );
      return;
    }
    setNewCatName("");
    void loadCategories();
  }

  async function deleteCategory(id: string, name: string) {
    if (
      !window.confirm(
        `¿Quitar la categoría "${name}"? Los materiales que ya la tengan la conservan; solo deja de aparecer en la lista para elegir.`,
      )
    )
      return;
    setCatBusy(true);
    setError(null);
    const { error: dErr } = await supabase
      .from("inventory_categories")
      .delete()
      .eq("id", id);
    setCatBusy(false);
    if (dErr) {
      setError(dErr.message);
      return;
    }
    void loadCategories();
  }

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
          <h2 className="text-2xl font-bold text-rondaCream">Materiales</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Catálogo maestro. Define el tipo de medida (Peso, Volumen o
            Unidades) de cada insumo; al comprar podrás registrar en la unidad
            que quieras (g o kg, ml o lt). La existencia y el costo se actualizan
            solos con las compras.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-muted2">
            Valor de inventario
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rondaCream">
            ${inventoryValue.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          + Agregar material
        </button>
        <button
          type="button"
          onClick={() => setShowCats((v) => !v)}
          className="h-11 rounded-lg border border-line bg-surface2 px-5 text-sm font-semibold text-rondaCream hover:bg-surface3"
        >
          {showCats ? "Cerrar categorías" : "Categorías"}
        </button>
      </div>

      {showCats ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-bold text-rondaCream">
            Categorías de materiales
          </p>
          <p className="mt-1 text-xs text-muted2">
            Agrega o quita categorías. Al quitar una, los materiales que ya la
            usan la conservan; solo deja de aparecer en la lista para elegir.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.length === 0 ? (
              <span className="text-xs text-muted2">Sin categorías.</span>
            ) : (
              categories.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface2 px-3 py-1.5 text-sm text-rondaCream"
                >
                  {c.name}
                  <button
                    type="button"
                    disabled={catBusy}
                    onClick={() => void deleteCategory(c.id, c.name)}
                    title="Quitar"
                    className="text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nueva categoría (ej. Abarrotes)"
              className="h-10 w-56 rounded-lg border border-line bg-surface3 px-3 text-sm text-rondaCream"
            />
            <button
              type="button"
              disabled={catBusy || !newCatName.trim()}
              onClick={() => void addCategory()}
              className="h-10 rounded-lg bg-rondaAccent px-4 text-sm font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
            >
              {catBusy ? "…" : "Agregar categoría"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted2">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[920px] text-left text-sm text-rondaCream">
            <thead className="border-b border-line bg-surface2 text-xs uppercase text-muted2">
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
                  <tr key={it.id} className="border-b border-line">
                    <td className="px-3 py-2">
                      <input
                        defaultValue={it.name}
                        disabled={busyId === it.id}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== it.name) void saveItem(it.id, { name: v });
                        }}
                        className="h-10 w-44 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.category}
                        disabled={busyId === it.id}
                        onChange={(e) =>
                          void saveItem(it.id, { category: e.target.value })
                        }
                        className="h-10 w-40 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
                      >
                        {[
                          ...catNames,
                          ...(catNames.includes(it.category)
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
                        className="h-10 w-44 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
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
                        className="h-10 w-32 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
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
                          className="h-10 w-24 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
                        />
                      ) : (
                        <span className="text-muted2">—</span>
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
                        className="h-10 w-24 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
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
                        className="h-10 w-20 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {Number(it.current_stock ?? 0).toLocaleString("es-MX", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-muted2">{unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
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
          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface3 p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold text-rondaCream">Nuevo material</h3>
            <form onSubmit={addItem} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-muted2">Nombre</label>
                <input
                  required
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                  placeholder="Ej. Queso mozzarella"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted2">Categoría</label>
                <select
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                >
                  {catNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted2">
                  Categoría contable
                </label>
                <select
                  value={fAccounting}
                  onChange={(e) => setFAccounting(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                >
                  {ACCOUNTING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted2">
                  Tipo de medida
                </label>
                <select
                  value={fBaseUnit}
                  onChange={(e) => setFBaseUnit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
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
                  <label className="mb-1 block text-xs text-muted2">
                    Piezas por paquete (opcional, si compras por caja/paquete)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={fPack}
                    onChange={(e) => setFPack(e.target.value)}
                    className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                    placeholder="Ej. 100"
                  />
                </div>
              ) : null}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted2">
                    Mínimo
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={fMin}
                    onChange={(e) => setFMin(e.target.value)}
                    className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                    placeholder="0"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-muted2">
                    Yield %
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={fYield}
                    onChange={(e) => setFYield(e.target.value)}
                    className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="h-11 flex-1 rounded-lg border border-line font-semibold text-rondaCream"
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
