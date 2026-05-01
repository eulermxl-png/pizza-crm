import type { ProductSizeChoice, SizeKey } from "@/modules/menu/constants";

export type OfflineCachedMenu = {
  id: "menu";
  products: Array<{
    id: string;
    name: string;
    category: string;
    image_url: string | null;
    prices: Record<SizeKey, number>;
    active: boolean;
    /** Default true when omitted (legacy cached menus). */
    has_sizes?: boolean;
  }>;
  customizations: Array<{
    id: string;
    name: string;
    active: boolean;
    extra_price: number;
  }>;
  savedAt: string;
};

export type OfflinePendingOrderItem = {
  local_line_id: string;
  product_id: string;
  productName: string;
  size: ProductSizeChoice;
  quantity: number;
  unit_price: number;
  customizations: string[];
};

export type OfflinePendingOrder = {
  local_id: string;
  created_at: string; // ISO
  origin: "walk_in" | "phone";
  customer_name: string | null;
  customer_phone: string | null;
  status: "pending" | "preparing" | "ready" | "delivered";
  payment_method: "cash" | "card" | "mixed";
  /** Caja portion; omit on legacy cached rows (sync derives from payment_method + total). */
  cash_amount?: number;
  /** Terminal portion; omit on legacy cached rows. */
  card_amount?: number;
  discount: number;
  total: number;
  items: OfflinePendingOrderItem[];
};

