import type { OrderOrigin } from "../types";

const ORIGINS: readonly OrderOrigin[] = [
  "walk_in",
  "phone",
  "delivery_app",
  "goat",
  "padel",
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
    case "padel":
      return "Padel";
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

/** Color de acento por origen (variable CSS). Refuerza el nombre, no lo sustituye. */
export function originAccentVar(origin: string): string {
  switch (origin) {
    case "phone":
      return "var(--teal)";
    case "delivery_app":
      return "var(--amber)";
    case "goat":
      return "var(--violet)";
    case "padel":
      return "var(--brand)";
    default:
      return "var(--muted-2)";
  }
}
