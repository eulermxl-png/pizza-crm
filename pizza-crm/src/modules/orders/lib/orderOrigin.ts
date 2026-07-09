import type { OrderOrigin } from "../types";

const ORIGINS: readonly OrderOrigin[] = [
  "walk_in",
  "phone",
  "delivery_app",
  "goat",
];

export function parseOrderOrigin(raw: string): OrderOrigin {
  if ((ORIGINS as readonly string[]).includes(raw)) return raw as OrderOrigin;
  return "walk_in";
}

export function originRequiresPhone(origin: OrderOrigin): boolean {
  return origin === "phone";
}

/** Spanish UI label for order origin (optional table context for dine-in). */
export function originLabelEs(
  origin: string,
  tableId?: string | null,
  tableName?: string | null,
): string {
  switch (origin) {
    case "phone":
      return "Teléfono";
    case "delivery_app":
      return "DIDI/Uber";
    case "goat":
      return "Goat";
    case "walk_in":
    default:
      if (tableId) {
        const n = (tableName ?? "").trim().toLowerCase();
        if (n === "barra") return "Barra";
        return "Mesa";
      }
      return "Mostrador";
  }
}
