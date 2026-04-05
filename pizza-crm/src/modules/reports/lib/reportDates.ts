import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

/** Inclusive local-date bounds for `orders.created_at` (timestamptz). */
export function ordersCreatedAtBounds(fromYmd: string, toYmd: string) {
  const a = fromYmd <= toYmd ? fromYmd : toYmd;
  const b = fromYmd <= toYmd ? toYmd : fromYmd;
  const startIso = new Date(`${a}T00:00:00`).toISOString();
  const endIso = new Date(`${b}T23:59:59.999`).toISOString();
  return { startIso, endIso, fromYmd: a, toYmd: b };
}

/** Every calendar day YYYY-MM-DD between a and b inclusive. */
export function eachLocalDayInclusive(fromYmd: string, toYmd: string): string[] {
  const a = fromYmd <= toYmd ? fromYmd : toYmd;
  const b = fromYmd <= toYmd ? toYmd : fromYmd;
  const out: string[] = [];
  const cur = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  while (cur <= end) {
    out.push(toLocalYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Monday = 0 … Sunday = 6 */
export function dayIndexMonSun(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

export const WEEKDAY_LABELS_MON_FIRST = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
] as const;

/** Heatmap row labels 06–23 */
export const HEATMAP_HOURS = Array.from(
  { length: 18 },
  (_, i) => 6 + i,
) as number[];
