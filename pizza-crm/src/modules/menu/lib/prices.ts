import { SIZE_KEYS, type SizeKey } from "../constants";
import type { ProductPrices } from "../types";

// English: normalize JSONB `prices` from Supabase into fixed small/medium/large keys.
export function parsePricesFromDb(json: unknown): ProductPrices {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { small: 0, medium: 0, large: 0 };
  }

  const o = json as Record<string, unknown>;
  const out: ProductPrices = { small: 0, medium: 0, large: 0 };

  for (const key of SIZE_KEYS) {
    const n = Number(o[key]);
    out[key] = Number.isFinite(n) ? n : 0;
  }

  return out;
}

export function pricesToJson(prices: ProductPrices): Record<SizeKey, number> {
  return {
    small: prices.small,
    medium: prices.medium,
    large: prices.large,
  };
}
