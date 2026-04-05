import type { ExpenseCategory } from "./constants";

export type ExpenseRow = {
  id: string;
  category: ExpenseCategory | string;
  description: string;
  amount: number;
  date: string;
};

export type ExpensePeriodPreset = "today" | "week" | "month" | "custom";
