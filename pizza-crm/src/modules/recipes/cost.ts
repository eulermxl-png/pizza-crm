import { unitByCode } from "@/modules/inventory/types";
import type { MaterialLite, Recipe, RecipeComponent } from "./types";

// Convierte una cantidad expresada en `unitCode` a la unidad base de `baseUnitCode`.
// Soporta cruce pieza↔peso/volumen usando piece_size (cantidad base por pieza).
export function toBaseUnit(
  qty: number,
  unitCode: string,
  baseUnitCode: string | null | undefined,
  pieceSize?: number | null,
): number | null {
  const u = unitByCode(unitCode);
  const b = unitByCode(baseUnitCode ?? undefined);
  if (!u || !b) return null;
  if (u.family === b.family) {
    return qty * (u.to_base_factor / b.to_base_factor);
  }
  // Cruce de familia: componente en piezas, material en peso/volumen
  if (u.code === "pza" && pieceSize && pieceSize > 0) {
    return qty * pieceSize;
  }
  return null;
}

// Cantidad expresada en la unidad base de su propia familia (para sub-recetas).
function toFamilyBase(qty: number, unitCode: string): number | null {
  const u = unitByCode(unitCode);
  if (!u) return null;
  return qty * u.to_base_factor;
}

export type CostMaps = {
  recipesById: Map<string, Recipe>;
  componentsByRecipe: Map<string, RecipeComponent[]>;
  materialsById: Map<string, MaterialLite>;
};

// Costo total de producir 1 "rendimiento" de la receta.
export function computeRecipeCost(
  recipeId: string,
  maps: CostMaps,
  seen: Set<string> = new Set(),
): number {
  if (seen.has(recipeId)) return 0; // guarda anti-ciclos
  const nextSeen = new Set(seen);
  nextSeen.add(recipeId);

  const comps = maps.componentsByRecipe.get(recipeId) ?? [];
  let total = 0;

  for (const c of comps) {
    if (c.component_type === "ingredient" && c.ingredient_id) {
      const m = maps.materialsById.get(c.ingredient_id);
      if (!m || !m.base_unit) continue;
      const qtyBase = toBaseUnit(Number(c.qty), c.unit, m.base_unit, m.piece_size);
      if (qtyBase == null) continue;
      const yieldPct = Number(m.yield_pct) || 100;
      const usableCost = (Number(m.current_cost) || 0) / (yieldPct / 100);
      total += qtyBase * usableCost;
    } else if (c.component_type === "recipe" && c.sub_recipe_id) {
      const sub = maps.recipesById.get(c.sub_recipe_id);
      if (!sub || !sub.yield_unit) continue;
      const subTotal = computeRecipeCost(c.sub_recipe_id, maps, nextSeen);
      const subYieldBase = toFamilyBase(Number(sub.yield_qty), sub.yield_unit);
      const compQtyBase = toFamilyBase(Number(c.qty), c.unit);
      if (subYieldBase == null || compQtyBase == null) continue;
      const effYield = subYieldBase * ((Number(sub.yield_pct) || 100) / 100);
      if (effYield <= 0) continue;
      total += subTotal * (compQtyBase / effYield);
    }
  }
  return total;
}

// Costo de un componente individual (para mostrar por línea).
export function componentCost(c: RecipeComponent, maps: CostMaps): number {
  const single: RecipeComponent = { ...c };
  const tmpId = "__tmp__";
  const m2: CostMaps = {
    recipesById: new Map(maps.recipesById).set(tmpId, {
      id: tmpId,
      name: "",
      section: "otro",
      yield_qty: 1,
      yield_unit: "g",
      yield_pct: 100,
      active: true,
    }),
    componentsByRecipe: new Map(maps.componentsByRecipe).set(tmpId, [single]),
    materialsById: maps.materialsById,
  };
  return computeRecipeCost(tmpId, m2);
}
