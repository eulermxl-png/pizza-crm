/** Local calendar date as YYYY-MM-DD (avoid UTC drift). */
export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfWeekFromMonday(monday: Date): Date {
  const e = new Date(monday);
  e.setDate(e.getDate() + 6);
  return e;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export type LocalDateRange = { from: string; to: string };

export function rangeForPreset(
  preset: "today" | "week" | "month",
  ref: Date = new Date(),
): LocalDateRange {
  if (preset === "today") {
    const ymd = toLocalYmd(ref);
    return { from: ymd, to: ymd };
  }
  if (preset === "week") {
    const mon = startOfWeekMonday(ref);
    const sun = endOfWeekFromMonday(mon);
    return { from: toLocalYmd(mon), to: toLocalYmd(sun) };
  }
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return { from: toLocalYmd(start), to: toLocalYmd(end) };
}
