"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  UNITS,
  familyOfBaseUnit,
  unitByCode,
} from "@/modules/inventory/types";

import { componentCost, computeRecipeCost, type CostMaps } from "./cost";
import {
  RECIPE_SECTIONS,
  RECIPE_YIELD_UNITS,
  sectionLabel,
  type MaterialLite,
  type ProductLite,
  type ProductRecipe,
  type Recipe,
  type RecipeComponent,
} from "./types";

const SIZES = [
  { value: "small", label: "Chica" },
  { value: "medium", label: "Mediana" },
  { value: "large", label: "Grande" },
];
function sizeLabel(s: string | null): string {
  if (!s) return "Única";
  return SIZES.find((x) => x.value === s)?.label ?? s;
}

function recipeUnitsForBase(
  baseUnit: string | null | undefined,
  pieceSize: number | null | undefined,
) {
  const fam = familyOfBaseUnit(baseUnit);
  let opts = UNITS.filter(
    (u) => u.family === fam && u.code !== "paquete" && u.code !== "porcion",
  );
  if (pieceSize && pieceSize > 0 && fam !== "pieza" && !opts.some((u) => u.code === "pza")) {
    const pza = UNITS.find((u) => u.code === "pza");
    if (pza) opts = [...opts, pza];
  }
  return opts;
}
function recipeUnitsForRecipe(sub: Recipe) {
  const fam = unitByCode(sub.yield_unit ?? undefined)?.family;
  return UNITS.filter((u) => u.family === fam && u.code !== "paquete");
}

export default function RecipesClient() {
  const supabase = useMemo(() => createClient(), []);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [components, setComponents] = useState<RecipeComponent[]>([]);
  const [materials, setMaterials] = useState<MaterialLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [prodRecipes, setProdRecipes] = useState<ProductRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nrName, setNrName] = useState("");
  const [nrSection, setNrSection] = useState<string>("pizza");
  const [nrYieldQty, setNrYieldQty] = useState("1");
  const [nrYieldUnit, setNrYieldUnit] = useState("pza");
  const [nrYieldPct, setNrYieldPct] = useState("100");

  const [acType, setAcType] = useState<"ingredient" | "recipe">("ingredient");
  const [acIngredient, setAcIngredient] = useState("");
  const [acSub, setAcSub] = useState("");
  const [acQty, setAcQty] = useState("");
  const [acUnit, setAcUnit] = useState("");
  const [acRole, setAcRole] = useState<"base" | "topping">("topping");

  const [lpProduct, setLpProduct] = useState("");
  const [lpSize, setLpSize] = useState("");

  const loadAll = useCallback(async () => {
    setError(null);
    const [r, c, m, p, pr] = await Promise.all([
      supabase
        .from("recipes")
        .select("id,name,section,yield_qty,yield_unit,yield_pct,active")
        .order("section", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("recipe_components")
        .select(
          "id,recipe_id,component_type,ingredient_id,sub_recipe_id,component_role,qty,unit,sort_order",
        )
        .order("sort_order", { ascending: true }),
      supabase
        .from("inventory_items")
        .select("id,name,base_unit,current_cost,yield_pct,piece_size")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("products")
        .select("id,name,has_sizes")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase.from("product_recipes").select("id,product_id,size,recipe_id"),
    ]);
    const err = r.error || c.error || m.error || p.error || pr.error;
    if (err) setError(err.message);
    setRecipes((r.data ?? []) as Recipe[]);
    setComponents((c.data ?? []) as RecipeComponent[]);
    setMaterials((m.data ?? []) as MaterialLite[]);
    setProducts((p.data ?? []) as ProductLite[]);
    setProdRecipes((pr.data ?? []) as ProductRecipe[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const maps: CostMaps = useMemo(() => {
    const recipesById = new Map(recipes.map((r) => [r.id, r]));
    const componentsByRecipe = new Map<string, RecipeComponent[]>();
    for (const c of components) {
      const a = componentsByRecipe.get(c.recipe_id) ?? [];
      a.push(c);
      componentsByRecipe.set(c.recipe_id, a);
    }
    const materialsById = new Map(materials.map((m) => [m.id, m]));
    return { recipesById, componentsByRecipe, materialsById };
  }, [recipes, components, materials]);

  const recipeCost = useCallback(
    (id: string) => computeRecipeCost(id, maps),
    [maps],
  );

  const selected = recipes.find((r) => r.id === selectedId) ?? null;
  const selectedComps = maps.componentsByRecipe.get(selectedId ?? "") ?? [];
  const selectedLinks = prodRecipes.filter((x) => x.recipe_id === selectedId);

  const acUnitOptions = useMemo(() => {
    if (acType === "ingredient") {
      const m = maps.materialsById.get(acIngredient);
      return m ? recipeUnitsForBase(m.base_unit, m.piece_size) : [];
    }
    const sub = maps.recipesById.get(acSub);
    return sub ? recipeUnitsForRecipe(sub) : [];
  }, [acType, acIngredient, acSub, maps]);

  useEffect(() => {
    if (!acUnitOptions.some((u) => u.code === acUnit)) {
      setAcUnit(acUnitOptions[0]?.code ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acUnitOptions]);

  function compName(c: RecipeComponent) {
    if (c.component_type === "ingredient")
      return maps.materialsById.get(c.ingredient_id ?? "")?.name ?? "—";
    return maps.recipesById.get(c.sub_recipe_id ?? "")?.name ?? "—";
  }

  async function createRecipe(e: React.FormEvent) {
    e.preventDefault();
    const name = nrName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { data, error: er } = await supabase
      .from("recipes")
      .insert({
        name,
        section: nrSection,
        yield_qty: Number(nrYieldQty) || 1,
        yield_unit: nrYieldUnit,
        yield_pct: Number(nrYieldPct) || 100,
      })
      .select("id,name,section,yield_qty,yield_unit,yield_pct,active")
      .single();
    setSaving(false);
    if (er) {
      setError(er.message);
      return;
    }
    setShowNew(false);
    setNrName("");
    await loadAll();
    if (data) setSelectedId((data as Recipe).id);
  }

  async function saveRecipe(id: string, patch: Partial<Recipe>) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("recipes").update(patch).eq("id", id);
    if (e) setError(e.message);
    setBusy(false);
    void loadAll();
  }

  async function deleteRecipe(r: Recipe) {
    if (!window.confirm(`¿Eliminar la receta ${r.name}?`)) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("recipes").delete().eq("id", r.id);
    setBusy(false);
    if (e) {
      setError(
        "No se pudo eliminar: quizá se usa como sub-receta o está ligada a un producto.",
      );
      return;
    }
    setSelectedId(null);
    void loadAll();
  }

  async function saveComponent(id: string, patch: Partial<RecipeComponent>) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("recipe_components")
      .update(patch)
      .eq("id", id);
    if (e) setError(e.message);
    setBusy(false);
    void loadAll();
  }

  async function deleteComponent(id: string) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from("recipe_components")
      .delete()
      .eq("id", id);
    if (e) setError(e.message);
    setBusy(false);
    void loadAll();
  }

  async function addComponent() {
    if (!selectedId) return;
    const qty = Number(acQty);
    if (!(qty > 0)) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (!acUnit) {
      setError("Elige la unidad.");
      return;
    }
    const row: Record<string, unknown> = {
      recipe_id: selectedId,
      component_type: acType,
      qty,
      unit: acUnit,
      component_role: acRole,
      sort_order:
        selectedComps.reduce((mx, c) => Math.max(mx, c.sort_order), 0) + 10,
    };
    if (acType === "ingredient") {
      if (!acIngredient) {
        setError("Elige el material.");
        return;
      }
      row.ingredient_id = acIngredient;
    } else {
      if (!acSub) {
        setError("Elige la sub-receta.");
        return;
      }
      row.sub_recipe_id = acSub;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("recipe_components").insert(row);
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setAcQty("");
    setAcIngredient("");
    setAcSub("");
    await loadAll();
  }

  async function linkProduct() {
    if (!selectedId || !lpProduct) return;
    const prod = products.find((p) => p.id === lpProduct);
    const size = prod?.has_sizes ? lpSize || null : null;
    if (prod?.has_sizes && !lpSize) {
      setError("Elige la talla.");
      return;
    }
    setBusy(true);
    setError(null);
    const existing = prodRecipes.find(
      (x) => x.product_id === lpProduct && (x.size ?? null) === (size ?? null),
    );
    const res = existing
      ? await supabase
          .from("product_recipes")
          .update({ recipe_id: selectedId })
          .eq("id", existing.id)
      : await supabase
          .from("product_recipes")
          .insert({ product_id: lpProduct, size, recipe_id: selectedId });
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setLpProduct("");
    setLpSize("");
    await loadAll();
  }

  async function unlinkProduct(id: string) {
    setBusy(true);
    const { error: e } = await supabase
      .from("product_recipes")
      .delete()
      .eq("id", id);
    setBusy(false);
    if (e) setError(e.message);
    void loadAll();
  }

  const inputCls =
    "h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100";

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{recipes.length} receta(s)</p>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          + Nueva receta
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {recipes.length === 0 ? (
              <p className="text-sm text-zinc-500">Aún no hay recetas.</p>
            ) : null}
            {recipes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={
                  selectedId === r.id
                    ? "block w-full rounded-lg border border-rondaAccent bg-zinc-900 px-3 py-2 text-left"
                    : "block w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left hover:bg-zinc-900"
                }
              >
                <div className="font-semibold text-zinc-100">{r.name}</div>
                <div className="text-xs text-zinc-500">
                  {sectionLabel(r.section)} · ${recipeCost(r.id).toFixed(2)}
                </div>
              </button>
            ))}
          </div>

          <div>
            {!selected ? (
              <p className="text-zinc-500">Elige una receta o crea una nueva.</p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1 block text-xs text-zinc-500">
                        Nombre
                      </label>
                      <input
                        defaultValue={selected.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== selected.name)
                            void saveRecipe(selected.id, { name: v });
                        }}
                        className={`${inputCls} h-11 w-full`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Apartado
                      </label>
                      <select
                        value={selected.section}
                        onChange={(e) =>
                          void saveRecipe(selected.id, { section: e.target.value })
                        }
                        className={`${inputCls} h-11`}
                      >
                        {RECIPE_SECTIONS.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Rinde
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          defaultValue={selected.yield_qty}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n > 0 && n !== selected.yield_qty)
                              void saveRecipe(selected.id, { yield_qty: n });
                          }}
                          className={`${inputCls} h-11 w-24`}
                        />
                        <select
                          value={selected.yield_unit ?? "pza"}
                          onChange={(e) =>
                            void saveRecipe(selected.id, {
                              yield_unit: e.target.value,
                            })
                          }
                          className={`${inputCls} h-11`}
                        >
                          {RECIPE_YIELD_UNITS.map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Yield %
                      </label>
                      <input
                        type="number"
                        defaultValue={selected.yield_pct}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n > 0 && n !== selected.yield_pct)
                            void saveRecipe(selected.id, { yield_pct: n });
                        }}
                        className={`${inputCls} h-11 w-20`}
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full min-w-[640px] text-left text-sm text-zinc-200">
                    <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">Componente</th>
                        <th className="px-3 py-2">Rol</th>
                        <th className="px-3 py-2">Cantidad</th>
                        <th className="px-3 py-2">Unidad</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3 py-2 text-center">Quitar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedComps.map((c) => (
                        <tr key={c.id} className="border-b border-zinc-800/60">
                          <td className="px-3 py-2">
                            {compName(c)}
                            <span className="ml-2 text-xs text-zinc-500">
                              {c.component_type === "recipe" ? "(sub-receta)" : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void saveComponent(c.id, {
                                  component_role:
                                    c.component_role === "base" ? "topping" : "base",
                                })
                              }
                              className={
                                c.component_role === "base"
                                  ? "rounded border border-sky-800 bg-sky-950/40 px-2 py-1 text-xs font-bold text-sky-200"
                                  : "rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-bold text-zinc-300"
                              }
                            >
                              {c.component_role === "base" ? "Base" : "Topping"}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              defaultValue={c.qty}
                              disabled={busy}
                              onBlur={(e) => {
                                const n = Number(e.target.value);
                                if (Number.isFinite(n) && n > 0 && n !== c.qty)
                                  void saveComponent(c.id, { qty: n });
                              }}
                              className={`${inputCls} w-24`}
                            />
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{c.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                            ${componentCost(c, maps).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteComponent(c.id)}
                              className="text-red-400 hover:underline"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                      {selectedComps.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                            Sin componentes todavía.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase text-zinc-500">
                    Agregar componente
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Tipo</label>
                      <select
                        value={acType}
                        onChange={(e) =>
                          setAcType(e.target.value as "ingredient" | "recipe")
                        }
                        className={`${inputCls} h-11`}
                      >
                        <option value="ingredient">Material</option>
                        <option value="recipe">Sub-receta</option>
                      </select>
                    </div>
                    {acType === "ingredient" ? (
                      <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-xs text-zinc-500">
                          Material
                        </label>
                        <select
                          value={acIngredient}
                          onChange={(e) => setAcIngredient(e.target.value)}
                          className={`${inputCls} h-11 w-full`}
                        >
                          <option value="">— Elige —</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-xs text-zinc-500">
                          Sub-receta
                        </label>
                        <select
                          value={acSub}
                          onChange={(e) => setAcSub(e.target.value)}
                          className={`${inputCls} h-11 w-full`}
                        >
                          <option value="">— Elige —</option>
                          {recipes
                            .filter((r) => r.id !== selectedId)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        value={acQty}
                        onChange={(e) => setAcQty(e.target.value)}
                        className={`${inputCls} h-11 w-24`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">
                        Unidad
                      </label>
                      <select
                        value={acUnit}
                        onChange={(e) => setAcUnit(e.target.value)}
                        className={`${inputCls} h-11`}
                      >
                        {acUnitOptions.length === 0 ? (
                          <option value="">—</option>
                        ) : null}
                        {acUnitOptions.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Rol</label>
                      <select
                        value={acRole}
                        onChange={(e) =>
                          setAcRole(e.target.value as "base" | "topping")
                        }
                        className={`${inputCls} h-11`}
                      >
                        <option value="topping">Topping</option>
                        <option value="base">Base</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void addComponent()}
                      className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <span className="text-sm uppercase tracking-wide text-zinc-500">
                    Costo de la receta
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-rondaCream">
                    ${recipeCost(selected.id).toFixed(2)}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase text-zinc-500">
                    Ligar a un producto del menú
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1 block text-xs text-zinc-500">
                        Producto
                      </label>
                      <select
                        value={lpProduct}
                        onChange={(e) => {
                          setLpProduct(e.target.value);
                          setLpSize("");
                        }}
                        className={`${inputCls} h-11 w-full`}
                      >
                        <option value="">— Elige —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {products.find((p) => p.id === lpProduct)?.has_sizes ? (
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          Talla
                        </label>
                        <select
                          value={lpSize}
                          onChange={(e) => setLpSize(e.target.value)}
                          className={`${inputCls} h-11`}
                        >
                          <option value="">— Elige —</option>
                          {SIZES.map((sz) => (
                            <option key={sz.value} value={sz.value}>
                              {sz.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !lpProduct}
                      onClick={() => void linkProduct()}
                      className="h-11 rounded-lg bg-rondaAccent px-5 text-sm font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
                    >
                      Ligar
                    </button>
                  </div>
                  {selectedLinks.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedLinks.map((lk) => {
                        const pn =
                          products.find((p) => p.id === lk.product_id)?.name ?? "—";
                        return (
                          <span
                            key={lk.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200"
                          >
                            {pn} · {sizeLabel(lk.size)}
                            <button
                              type="button"
                              onClick={() => void unlinkProduct(lk.id)}
                              className="text-red-400 hover:underline"
                            >
                              quitar
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => void deleteRecipe(selected)}
                    className="text-sm font-semibold text-red-400 hover:underline"
                  >
                    Eliminar receta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showNew ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/60"
            onClick={() => !saving && setShowNew(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-50">Nueva receta</h3>
            <form onSubmit={createRecipe} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Nombre</label>
                <input
                  required
                  value={nrName}
                  onChange={(e) => setNrName(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  placeholder="Ej. Pizza Pepperoni, Salsa de tomate"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Apartado</label>
                <select
                  value={nrSection}
                  onChange={(e) => setNrSection(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                >
                  {RECIPE_SECTIONS.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">Rinde</label>
                  <input
                    type="number"
                    value={nrYieldQty}
                    onChange={(e) => setNrYieldQty(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-zinc-500">Unidad</label>
                  <select
                    value={nrYieldUnit}
                    onChange={(e) => setNrYieldUnit(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  >
                    {RECIPE_YIELD_UNITS.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-xs text-zinc-500">Yield %</label>
                  <input
                    type="number"
                    value={nrYieldPct}
                    onChange={(e) => setNrYieldPct(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Tip: una salsa rinde en gramos (ej. 2000 g); una pizza rinde 1 pza.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="h-11 flex-1 rounded-lg border border-zinc-700 font-semibold text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 flex-1 rounded-lg bg-rondaAccent font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
