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
        className="h-11 rounded-lg border border-line bg-surface2 px-4 text-sm font-semibold text-rondaCream hover:bg-surface3 disabled:opacity-50"
      >
        Mes actual
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(previousMonthRange())}
        className="h-11 rounded-lg border border-line bg-surface2 px-4 text-sm font-semibold text-rondaCream hover:bg-surface3 disabled:opacity-50"
      >
        Mes anterior
      </button>
    </div>
  );
}
