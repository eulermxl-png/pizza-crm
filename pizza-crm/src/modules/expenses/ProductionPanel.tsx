"use client";

/**
 * Producción de preparaciones de la casa (p. ej. salsa de tomate casera).
 * Una tanda descuenta los ingredientes de la receta y suma el producto a su insumo
 * con el costo real de esos ingredientes. No genera gasto (migración 0061).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { purchaseUnitsFor, unitByCode } from "@/modules/inventory/types";

import { toLocalYmd, type LocalDateRange } from "./lib/dateRange";

type OutputItem = { id: string; name: string; base_unit: string | null; current_cost: number | string | null };

type ProdRecipe = {
  id: string;
  name: string;
  yield_qty: number | string | null;
  yield_unit: string | null;
  yield_pct: number | string | null;
  output: OutputItem | null;
  components: {
    qty: number | string;
    unit: string;
    component_type: string;
    ingredient: { name: string; base_unit: string | null; current_cost: number | string | null } | null;
  }[];
};

type ProductionRow = {
  id: string;
  qty_base: number | string;
  total_cost: number | string;
  unit_cost_base: number | string;
  produced_at: string;
  notes: string | null;
  recipe: { name: string } | null;
  item: { name: string; base_unit: string | null } | null;
};

const fmtQty = (v: number) => v.toLocaleString("es-MX", { maximumFractionDigits: 2 });
const money = (v: number, dec = 2) =>
  `$${v.toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

/** Convierte entre unidades de la misma familia (g↔kg, ml↔lt). */
function convert(qty: number, from: string, to: string | null): number | null {
  const a = unitByCode(from);
  const b = unitByCode(to);
  if (!a || !b || a.family !== b.family) return null;
  return qty * (a.to_base_factor / b.to_base_factor);
}

/* ---------- Modal para registrar una tanda ---------- */

export function ProductionModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recipes, setRecipes] = useState<ProdRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [date, setDate] = useState(() => toLocalYmd(new Date()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setQty("");
    setNotes("");
    setDate(toLocalYmd(new Date()));
    setLoading(true);
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("recipes")
        .select(
          "id, name, yield_qty, yield_unit, yield_pct, output:inventory_items!recipes_output_item_id_fkey(id, name, base_unit, current_cost), components:recipe_components!recipe_components_recipe_id_fkey(qty, unit, component_type, ingredient:inventory_items!recipe_components_ingredient_id_fkey(name, base_unit, current_cost))",
        )
        .eq("active", true)
        .not("output_item_id", "is", null)
        .order("name", { ascending: true });
      setLoading(false);
      if (qErr) {
        setError(qErr.message);
        return;
      }
      const list = (data ?? []) as unknown as ProdRecipe[];
      setRecipes(list);
      const first = list[0];
      setRecipeId((cur) => (list.some((r) => r.id === cur) ? cur : first?.id ?? ""));
    })();
  }, [open, supabase]);

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  const outUnit = recipe?.output?.base_unit ?? null;
  const unitOptions = purchaseUnitsFor(outUnit).filter((u) => u.code !== "paquete");

  useEffect(() => {
    // Unidad por default: la del rendimiento de la receta (o la base del insumo).
    if (!recipe) return;
    const preferred = recipe.yield_unit && unitOptions.some((u) => u.code === recipe.yield_unit) ? recipe.yield_unit : outUnit;
    setUnit(preferred ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, recipes]);

  // Vista previa: ingredientes que se van a descontar y costo estimado.
  const preview = useMemo(() => {
    const q = Number(qty);
    if (!recipe || !(q > 0) || !unit) return null;
    const madeBase = convert(q, unit, outUnit);
    const yieldBase =
      recipe.yield_unit != null
        ? convert(Number(recipe.yield_qty) * (Number(recipe.yield_pct ?? 100) / 100), recipe.yield_unit, outUnit)
        : null;
    if (madeBase == null || !yieldBase) return null;
    const mult = madeBase / yieldBase;
    let total = 0;
    let hasSub = false;
    const lines = recipe.components
      .filter((c) => {
        if (c.component_type !== "ingredient") hasSub = true;
        return c.component_type === "ingredient" && c.ingredient;
      })
      .map((c) => {
        const used = Number(c.qty) * mult;
        const usedBase = convert(used, c.unit, c.ingredient!.base_unit) ?? 0;
        const cost = usedBase * (Number(c.ingredient!.current_cost) || 0);
        total += cost;
        return { name: c.ingredient!.name, used, unit: c.unit, cost, noCost: !(Number(c.ingredient!.current_cost) > 0) };
      });
    return { lines, total, perBase: total / madeBase, madeBase, hasSub };
  }, [recipe, qty, unit, outUnit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = Number(qty);
    if (!recipe) return setError("Elige qué se produjo.");
    if (!(q > 0)) return setError("Escribe cuánto salió.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Fecha inválida.");
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc("apply_production", {
      p_recipe_id: recipe.id,
      p_qty: q,
      p_unit: unit,
      p_produced_at: date,
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (rpcErr) return setError(rpcErr.message);
    onSaved(`Producción registrada: ${fmtQty(q)} ${unit} de ${recipe.output?.name ?? recipe.name}.`);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface3 p-5 shadow-xl sm:rounded-2xl">
        <h3 className="text-lg font-bold text-rondaCream">Registrar producción</h3>
        <p className="mt-1 text-xs text-muted2">
          Descuenta los ingredientes de la receta y suma lo que salió al inventario. No es un gasto.
        </p>

        {loading ? <p className="py-6 text-center text-sm text-muted2">Cargando…</p> : null}

        {!loading && recipes.length === 0 ? (
          <p className="mt-4 rounded-lg border border-line bg-surface2 p-3 text-sm text-muted">
            No hay recetas de preparación configuradas. Pídele al administrador ligar la receta (p. ej.
            “Salsa de tomate (Ronda)”) con el insumo que produce.
          </p>
        ) : null}

        {!loading && recipes.length > 0 ? (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-muted2">¿Qué se hizo?</label>
              <select
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-sm text-rondaCream"
              >
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} → {r.output?.name}
                  </option>
                ))}
              </select>
              {recipe?.yield_qty ? (
                <p className="mt-1 text-xs text-muted2">
                  La receta rinde {fmtQty(Number(recipe.yield_qty))} {recipe.yield_unit}.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted2">¿Cuánto salió?</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Ej. 3"
                  className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                  autoFocus
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="h-11 rounded-lg border border-line bg-surface2 px-3 text-sm text-rondaCream"
                >
                  {unitOptions.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {preview ? (
              <div className="rounded-lg border border-line bg-surface2 p-3 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted2">Se descuenta</p>
                <ul className="space-y-1">
                  {preview.lines.map((l) => (
                    <li key={l.name} className="flex justify-between gap-3 text-muted">
                      <span>
                        {l.name}: {fmtQty(l.used)} {l.unit}
                        {l.noCost ? <span className="ml-1 text-xs text-amber-400">(sin costo)</span> : null}
                      </span>
                      <span className="tabular-nums">{money(l.cost)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between border-t border-line pt-2 font-semibold text-rondaCream">
                  <span>Costo de la tanda</span>
                  <span className="tabular-nums">{money(preview.total)}</span>
                </p>
                <p className="mt-0.5 text-right text-xs text-muted2">
                  {money(preview.perBase, 4)} por {outUnit}
                </p>
                {preview.hasSub ? (
                  <p className="mt-1 text-xs text-muted2">Incluye sub-recetas: el costo final lo calcula el sistema.</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-muted2">Fecha</label>
                <input
                  type="date"
                  value={date}
                  max={toLocalYmd(new Date())}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-date-dark h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted2">Nota (opcional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. tanda de la mañana"
                className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-sm text-rondaCream"
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-lg border border-line bg-surface2 px-4 text-sm font-semibold text-rondaCream hover:bg-surface3"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-11 rounded-lg bg-sky-700 px-5 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Registrar producción"}
              </button>
            </div>
          </form>
        ) : null}
        {error && !loading && recipes.length === 0 ? (
          <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Lista de tandas del periodo ---------- */

export function ProductionList({
  range,
  refreshKey,
  search,
  onChanged,
}: {
  range: LocalDateRange;
  refreshKey: number;
  search: string;
  onChanged: (msg: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from("inventory_productions")
      .select(
        "id, qty_base, total_cost, unit_cost_base, produced_at, notes, recipe:recipes(name), item:inventory_items(name, base_unit)",
      )
      .gte("produced_at", range.from)
      .lte("produced_at", range.to)
      .order("produced_at", { ascending: false })
      .order("created_at", { ascending: false });
    // Si la migración 0061 aún no está aplicada, la sección simplemente no se muestra.
    if (qErr) {
      setRows([]);
      setError(qErr.code === "42P01" || /does not exist/i.test(qErr.message) ? null : qErr.message);
      return;
    }
    setError(null);
    setRows((data ?? []) as unknown as ProductionRow[]);
  }, [supabase, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = useMemo(() => {
    const fold = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const terms = fold(search).split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((r) => {
      const hay = fold(
        [r.recipe?.name, r.item?.name, r.notes, r.produced_at, "produccion"].filter(Boolean).join(" "),
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, search]);

  async function remove(r: ProductionRow) {
    setBusy(r.id);
    const { error: rpcErr } = await supabase.rpc("delete_production", { p_id: r.id });
    setBusy(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    onChanged("Producción eliminada (se regresaron los ingredientes al inventario).");
    await load();
  }

  if (!error && visible.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-bold text-rondaCream">Producción del período ({visible.length})</h3>
      <p className="mt-0.5 text-xs text-muted2">
        No suma al total de gastos: los ingredientes ya se pagaron al comprarlos.
      </p>
      {error ? (
        <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/40 p-2 text-sm text-red-200">{error}</div>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm text-rondaCream">
          <thead className="border-b border-line text-xs uppercase text-muted2">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Qué se hizo</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const q = Number(r.qty_base);
              const u = r.item?.base_unit ?? "";
              const shown = u === "ml" && q >= 1000 ? `${fmtQty(q / 1000)} lt` : u === "g" && q >= 1000 ? `${fmtQty(q / 1000)} kg` : `${fmtQty(q)} ${u}`;
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{r.produced_at}</td>
                  <td className="px-3 py-2 text-muted">
                    {r.item?.name ?? r.recipe?.name}
                    <span className="ml-2 rounded bg-sky-950/60 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-300">
                      producción
                    </span>
                    {r.notes ? <span className="block text-xs text-muted2">{r.notes}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{shown}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {money(Number(r.total_cost))}
                    <span className="block text-xs text-muted2">
                      {money(Number(r.unit_cost_base), 4)}/{u}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void remove(r)}
                      className="text-red-400 hover:underline disabled:opacity-50"
                    >
                      {busy === r.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
