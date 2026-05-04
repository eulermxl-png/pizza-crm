export type TableStatus = "free" | "occupied" | "waiting_payment";

export type TableRow = {
  id: string;
  number: number;
  name: string;
  status: TableStatus;
  current_order_id: string | null;
  opened_at: string | null;
  /** Optional label for the mesa session (set al abrir mesa). */
  customer_name?: string | null;
};

export type UnpaidOrderRow = {
  id: string;
  created_at: string;
  total: number;
  order_items: {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    size: string;
    customizations: unknown;
  }[] | null;
};
