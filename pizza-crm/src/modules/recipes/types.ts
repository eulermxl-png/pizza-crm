export type RecipeSection =
  | "pizza"
  | "base_pizza"
  | "salsa"
  | "bebida"
  | "complemento"
  | "otro";

export const RECIPE_SECTIONS: { value: RecipeSection; label: string }[] = [
  { value: "pizza", label: "Pizza" },
  { value: "base_pizza", label: "Base de pizza" },
  { value: "salsa", label: "Salsa" },
  { value: "bebida", label: "Bebida" },
  { value: "complemento", label: "Complemento" },
  { value: "otro", label: "Otro" },
];

export function sectionLabel(s: string): string {
  return RECIPE_SECTIONS.find((x) => x.value === s)?.label ?? s;
}

// Unidades para el rendimiento de una receta (incluye Porción para tandas)
export const RECIPE_YIELD_UNITS: { code: string; label: string }[] = [
  { code: "g", label: "g (peso)" },
  { code: "ml", label: "ml (volumen)" },
  { code: "pza", label: "pza" },
  { code: "porcion", label: "porción" },
];

export type Recipe = {
  id: string;
  name: string;
  section: string;
  yield_qty: number;
  yield_unit: string | null;
  yield_pct: number;
  active: boolean;
};

export type ComponentType = "ingredient" | "recipe";
export type ComponentRole = "base" | "topping";

export type RecipeComponent = {
  id: string;
  recipe_id: string;
  component_type: ComponentType;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  component_role: ComponentRole;
  qty: number;
  unit: string;
  sort_order: number;
};

// Vista ligera de material para costeo
export type MaterialLite = {
  id: string;
  name: string;
  base_unit: string | null;
  current_cost: number | null;
  yield_pct: number | null;
  piece_size: number | null;
};

export type ProductLite = {
  id: string;
  name: string;
  has_sizes: boolean;
};

export type ProductRecipe = {
  id: string;
  product_id: string;
  size: string | null;
  recipe_id: string;
};
