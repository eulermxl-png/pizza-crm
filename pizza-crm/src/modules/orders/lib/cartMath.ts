import type { CartLine, OrderPaymentMethod } from "../types";

// English: subtotal from cart lines (unit price already matches selected size).
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

export function cartTotal(subtotal: number, discount: number): number {
  const t = subtotal - discount;
  return t > 0 ? t : 0;
}

/** Max difference (pesos) allowed between efectivo + tarjeta and order total for mixed pay. */
export const MIXED_PAYMENT_TOLERANCE = 1;

export function parseMoneyInput(raw: string): number {
  const t = raw.trim().replace(",", ".");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function mixedAmountsMatchTotal(
  cash: number,
  card: number,
  orderTotal: number,
  tolerance = MIXED_PAYMENT_TOLERANCE,
): boolean {
  return Math.abs(cash + card - orderTotal) <= tolerance;
}

/** Persisted `orders.cash_amount` / `orders.card_amount` for reconciliation. */
export function orderPaymentAmounts(
  pm: OrderPaymentMethod,
  orderTotal: number,
  mixedCashStr: string,
  mixedCardStr: string,
): { cash_amount: number; card_amount: number } {
  if (pm === "cash") return { cash_amount: orderTotal, card_amount: 0 };
  if (pm === "card") return { cash_amount: 0, card_amount: orderTotal };
  return {
    cash_amount: parseMoneyInput(mixedCashStr),
    card_amount: parseMoneyInput(mixedCardStr),
  };
}
