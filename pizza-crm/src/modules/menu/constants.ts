export const PRODUCT_CATEGORIES = [
  "Pizzas",
  "Bebidas",
  "Entradas",
  "Combos",
  "Postres",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const SIZE_KEYS = ["small", "medium", "large"] as const;

export type SizeKey = (typeof SIZE_KEYS)[number];

export const SIZE_LABELS_ES: Record<SizeKey, string> = {
  small: "Pequeña",
  medium: "Mediana",
  large: "Grande",
};

export const PRODUCT_IMAGES_BUCKET = "product-images";
