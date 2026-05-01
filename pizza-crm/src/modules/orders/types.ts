import type { ProductSizeChoice } from "@/modules/menu/constants";

export type OrderOrigin = "walk_in" | "phone";

/** Stored in `orders.payment_method` for reconciliation (caja / terminal). */
export type OrderPaymentMethod = "cash" | "card" | "mixed";

export type CartLine = {
  key: string;
  productId: string;
  productName: string;
  size: ProductSizeChoice;
  quantity: number;
  unitPrice: number;
  customizationNames: string[];
};

export type PhoneSuggestion = {
  customer_name: string | null;
  customer_phone: string;
};
