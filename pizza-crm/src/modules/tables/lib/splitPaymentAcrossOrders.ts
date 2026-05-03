/**
 * Split total cash/card across order rows by each order's share of grandTotal.
 * Adjusts the last row so sums match exactly (cent rounding).
 */
export function splitPaymentAcrossOrders(
  orderTotals: number[],
  totalCash: number,
  totalCard: number,
): { cash: number[]; card: number[] } {
  const n = orderTotals.length;
  if (n === 0) return { cash: [], card: [] };

  const grand = orderTotals.reduce((a, b) => a + b, 0);
  if (grand <= 0) {
    return {
      cash: orderTotals.map(() => 0),
      card: orderTotals.map(() => 0),
    };
  }

  const cash: number[] = [];
  const card: number[] = [];
  let cashSum = 0;
  let cardSum = 0;

  for (let i = 0; i < n; i++) {
    const ratio = orderTotals[i] / grand;
    const c = i === n - 1 ? totalCash - cashSum : round2(totalCash * ratio);
    const d = i === n - 1 ? totalCard - cardSum : round2(totalCard * ratio);
    cash.push(c);
    card.push(d);
    cashSum += c;
    cardSum += d;
  }

  return { cash, card };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
