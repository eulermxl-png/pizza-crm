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
};

export type CustomizationRow = {
  id: string;
  name: string;
  active: boolean;
  extra_price: number;
};
