import type { OrderOrigin } from "@/modules/orders/types";
import type { SizeKey } from "@/modules/menu/constants";

export type KitchenOrderStatus = "pending" | "preparing" | "ready" | "delivered";

export type KitchenLineItem = {
  id: string;
  quantity: number;
  size: SizeKey | string;
  productName: string;
  customizations: string[];
};

export type KitchenOrderCard = {
  id: string;
  displayCode: string;
  origin: OrderOrigin;
  customerName: string | null;
  customerPhone: string | null;
  status: KitchenOrderStatus;
  createdAt: string;
  items: KitchenLineItem[];
};
