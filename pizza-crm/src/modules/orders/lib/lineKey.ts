import type { ProductSizeChoice } from "@/modules/menu/constants";

// English: stable key so identical lines merge quantities in the cart.
export function makeCartLineKey(
  productId: string,
  size: ProductSizeChoice,
  customizationNames: string[],
  comboGroupId?: string | null,
) {
  const sorted = [...customizationNames].sort().join("|");
  const comboSuffix = comboGroupId ? `:combo:${comboGroupId}` : "";
  return `${productId}:${size}:${sorted}${comboSuffix}`;
}
