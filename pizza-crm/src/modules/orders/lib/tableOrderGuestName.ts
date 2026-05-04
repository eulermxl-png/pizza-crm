/** Resolve display guest name: prefer live `tables.customer_name`, then order row. */
export function guestNameFromTableJoin(tables: unknown): string | null {
  if (tables == null) return null;
  const row = Array.isArray(tables) ? tables[0] : tables;
  if (!row || typeof row !== "object") return null;
  const raw = (row as { customer_name?: unknown }).customer_name;
  const s = typeof raw === "string" ? raw.trim() : "";
  return s || null;
}

export function resolveOrderDisplayCustomerName(row: {
  customer_name: string | null;
  tables?: unknown;
}): string | null {
  return (
    guestNameFromTableJoin(row.tables) ??
    (row.customer_name?.trim() || null)
  );
}
