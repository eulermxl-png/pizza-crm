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

/** Stored in order_items.size when product.has_sizes is false. */
export const STANDARD_PRODUCT_SIZE = "standard" as const;

export type ProductSizeChoice = SizeKey | typeof STANDARD_PRODUCT_SIZE;

export const SIZE_LABELS_ES: Record<SizeKey, string> = {
  small: "Pequeña",
  medium: "Mediana",
  large: "Grande",
};

/** Label for cashier/kitchen summaries (non-sized products use one price). */
export function sizeChoiceLabelEs(size: string): string {
  if (size === STANDARD_PRODUCT_SIZE) return "Único";
  if (size === "small" || size === "medium" || size === "large") {
    return SIZE_LABELS_ES[size];
  }
  return size;
}

export const PRODUCT_IMAGES_BUCKET = "product-images";
