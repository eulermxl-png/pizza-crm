"use client";

import {
  currentMonthRangeToToday,
  previousMonthRange,
  type LocalDateRange,
} from "@/modules/expenses/lib/dateRange";

type Props = {
  onSelect: (range: LocalDateRange) => void;
  disabled?: boolean;
};

export function MonthRangeQuickButtons({ onSelect, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(currentMonthRangeToToday())}
        className="h-11 rounded-lg border border-zinc-600 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        Mes actual
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(previousMonthRange())}
        className="h-11 rounded-lg border border-zinc-600 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        Mes anterior
      </button>
    </div>
  );
}
