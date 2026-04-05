import type { SizeKey } from "@/modules/menu/constants";

// English: stable key so identical lines merge quantities in the cart.
export function makeCartLineKey(
  productId: string,
  size: SizeKey,
  customizationNames: string[],
) {
  const sorted = [...customizationNames].sort().join("|");
  return `${productId}:${size}:${sorted}`;
}
