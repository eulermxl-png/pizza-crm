import { parsePricesFromDb } from "./prices";
import type { CustomizationRow, ProductRow } from "../types";

export function mapProductFromDb(row: {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  prices: unknown;
  active: boolean;
}): ProductRow {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    image_url: row.image_url,
    prices: parsePricesFromDb(row.prices),
    active: row.active,
  };
}

export function mapCustomizationFromDb(row: {
  id: string;
  name: string;
  active: boolean;
  extra_price?: unknown;
}): CustomizationRow {
  const ep = Number(row.extra_price);
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    extra_price: Number.isFinite(ep) ? ep : 0,
  };
}
