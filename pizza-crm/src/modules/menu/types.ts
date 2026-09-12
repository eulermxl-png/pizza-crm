import type { SizeKey } from "./constants";

export type ProductPrices = Record<SizeKey, number>;

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  prices: ProductPrices;
  active: boolean;
  /** When false, one price applies; cashier skips size picker. */
  has_sizes: boolean;
  /** Combo products require picking nested components in cashier flow. */
  is_combo: boolean;
};

export type CustomizationRow = {
  id: string;
  name: string;
  active: boolean;
  extra_price: number;
};

export type ComboComponentRow = {
  id: string;
  combo_product_id: string;
  component_product_id: string | null;
  component_category: string | null;
  quantity: number;
  is_fixed: boolean;
  sort_order: number;
};
