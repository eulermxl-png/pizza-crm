export type CashReconciliationRow = {
  id: string;
  date: string;
  cash_total: number;
  terminal_total: number;
  system_total: number;
  difference: number;
  opening_float: number | null;
  cash_counted: number | null;
  cash_difference: number | null;
  cash_withdrawals: number | null;
  cash_deposits: number | null;
  tips_total: number | null;
  notes: string | null;
};

/** Sums from orders for one calendar day (internal records). */
export type DayPaymentTotals = {
  cashSystem: number;
  cardSystem: number;
  tipsSystem: number;
  ordersWithoutMethod: number;
};

/** Retiro o abono de caja del día. */
export type CashMovementRow = {
  id: string;
  date: string;
  kind: "retiro" | "abono";
  amount: number;
  reason: string | null;
  created_at: string;
};
