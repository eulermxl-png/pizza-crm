export type CashReconciliationRow = {
  id: string;
  date: string;
  cash_total: number;
  terminal_total: number;
  system_total: number;
  difference: number;
  notes: string | null;
};

/** Sums from orders for one calendar day (internal records). */
export type DayPaymentTotals = {
  cashSystem: number;
  cardSystem: number;
  ordersWithoutMethod: number;
};
