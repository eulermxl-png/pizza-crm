import type { ProductSizeChoice } from "@/modules/menu/constants";

// English: stable key so identical lines merge quantities in the cart.
export function makeCartLineKey(
  productId: string,
  size: ProductSizeChoice,
  customizationNames: string[],
  comboGroupId?: string | null,
  halfFlavors?: string[] | null,
) {
  const sorted = [...customizationNames].sort().join("|");
  const comboSuffix = comboGroupId ? `:combo:${comboGroupId}` : "";
  const halfSuffix =
    halfFlavors && halfFlavors.length ? `:half:${[...halfFlavors].join("+")}` : "";
  return `${productId}:${size}:${sorted}${comboSuffix}${halfSuffix}`;
}
