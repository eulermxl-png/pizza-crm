// Plataformas de entrega (Uber / DiDi): alta y precio por producto.
// Tabla: product_platform_prices(product_id, platform, price, active).

export type SalesPlatform = "uber" | "didi";

export const SALES_PLATFORMS: readonly SalesPlatform[] = ["uber", "didi"] as const;

export function platformLabelEs(p: SalesPlatform | string | null | undefined): string {
  if (p === "uber") return "Uber";
  if (p === "didi") return "DiDi";
  return "Plataforma";
}

export function parseSalesPlatform(raw: unknown): SalesPlatform | null {
  return raw === "uber" || raw === "didi" ? raw : null;
}

/** Borrador del editor de producto. */
export type PlatformDraft = Record<SalesPlatform, { on: boolean; price: string }>;

export function emptyPlatformDraft(): PlatformDraft {
  return { uber: { on: false, price: "" }, didi: { on: false, price: "" } };
}

/** productId -> precio por plataforma (solo filas activas). */
export type PlatformPriceMap = Record<string, Partial<Record<SalesPlatform, number>>>;

export type PlatformPriceRow = {
  product_id: string;
  platform: string;
  price: number | string;
  active: boolean | null;
};

export function buildPlatformPriceMap(rows: PlatformPriceRow[]): PlatformPriceMap {
  const map: PlatformPriceMap = {};
  for (const r of rows) {
    const pf = parseSalesPlatform(r.platform);
    if (!pf || r.active === false) continue;
    const price = Number(r.price);
    if (!Number.isFinite(price)) continue;
    (map[r.product_id] ??= {})[pf] = price;
  }
  return map;
}
