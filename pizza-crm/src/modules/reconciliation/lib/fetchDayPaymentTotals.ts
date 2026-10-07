import type { SupabaseClient } from "@supabase/supabase-js";

import { ordersCreatedAtBounds } from "@/modules/reports/lib/reportDates";

import type { DayPaymentTotals } from "../types";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Caja total uses `cash_amount`; terminal (BBVA) total uses `card_amount`.
 * Legacy rows (before split columns) fall back to `payment_method` + `total`.
 * Cancelled orders are excluded. Platform orders (Uber/DiDi) are reported
 * apart: that money does not reach the cash drawer or the bank.
 */
export async function fetchDayPaymentTotals(
  supabase: SupabaseClient,
  dateYmd: string,
): Promise<DayPaymentTotals> {
  const { startIso, endIso } = ordersCreatedAtBounds(dateYmd, dateYmd);

  const { data, error } = await supabase
    .from("orders")
    .select("total, payment_method, cash_amount, card_amount, tip, origin, platform, status")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);

  let cashSystem = 0;
  let cardSystem = 0;
  let tipsSystem = 0;
  let ordersWithoutMethod = 0;
  const platform = { uber: 0, didi: 0, unspecified: 0, total: 0, count: 0 };

  for (const row of data ?? []) {
    const orderTotal = Number(row.total);
    if (row.payment_method === "platform" || row.origin === "delivery_app") {
      const t = Number.isFinite(orderTotal) ? orderTotal : 0;
      if (row.platform === "uber") platform.uber += t;
      else if (row.platform === "didi") platform.didi += t;
      else platform.unspecified += t;
      platform.total += t;
      platform.count += 1;
      continue;
    }
    const cashAmt = Number(row.cash_amount);
    const cardAmt = Number(row.card_amount);
    const pm = row.payment_method;

    const tip = Number(row.tip);
    if (Number.isFinite(tip)) tipsSystem += tip;

    const c = Number.isFinite(cashAmt) ? cashAmt : 0;
    const d = Number.isFinite(cardAmt) ? cardAmt : 0;
    const useSplit =
      c > 0 || d > 0 || pm === "mixed";

    if (useSplit) {
      cashSystem += c;
      cardSystem += d;
      continue;
    }

    if (pm === "cash") cashSystem += orderTotal;
    else if (pm === "card") cardSystem += orderTotal;
    else ordersWithoutMethod += 1;
  }

  return {
    cashSystem: roundMoney(cashSystem),
    cardSystem: roundMoney(cardSystem),
    tipsSystem: roundMoney(tipsSystem),
    ordersWithoutMethod,
    platform: {
      uber: roundMoney(platform.uber),
      didi: roundMoney(platform.didi),
      unspecified: roundMoney(platform.unspecified),
      total: roundMoney(platform.total),
      count: platform.count,
    },
  };
}
