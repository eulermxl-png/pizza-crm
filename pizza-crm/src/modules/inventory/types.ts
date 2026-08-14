export type InventoryLevel = "suficiente" | "mitad" | "poco" | "agotado";

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  sort_order: number;
  active: boolean;
};

export type InventoryReport = {
  id: string;
  created_at: string;
  created_by: string | null;
  notes: string | null;
  creator_name?: string | null;
};

export type InventoryReportItem = {
  id: string;
  report_id: string;
  item_id: string;
  level: InventoryLevel;
  quantity_text: string | null;
  item_name?: string;
  item_category?: string;
  item_sort_order?: number;
};

export const INVENTORY_LEVELS: {
  value: InventoryLevel;
  label: string;
  emoji: string;
}[] = [
  { value: "suficiente", label: "Suficiente", emoji: "🟢" },
  { value: "mitad", label: "Mitad", emoji: "🟡" },
  { value: "poco", label: "Poco", emoji: "🟠" },
  { value: "agotado", label: "Se acabó", emoji: "🔴" },
];

export const INVENTORY_CATEGORIES = [
  "Básicos",
  "Carnes",
  "Quesos y lácteos",
  "Frutas y verduras",
  "Salsas y aderezos",
  "Empaque y desechables",
  "Otros",
] as const;
