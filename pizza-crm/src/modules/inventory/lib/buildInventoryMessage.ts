import type { InventoryLevel } from "../types";

export type MessageLineItem = {
  name: string;
  level: InventoryLevel;
  quantity_text: string | null;
  sort_order?: number;
};

function quedaLine(item: MessageLineItem): string {
  const qty = item.quantity_text?.trim();
  if (qty) {
    if (qty.toLowerCase().includes(item.name.toLowerCase())) {
      return `- ${qty}`;
    }
    return `- ${qty} de ${item.name}`;
  }
  if (item.level === "mitad") {
    return `- La mitad de ${item.name}`;
  }
  return `- Suficiente ${item.name}`;
}

function faltaLine(item: MessageLineItem): string {
  if (item.level === "poco") {
    return `- ${item.name} (queda poco)`;
  }
  return `- ${item.name}`;
}

/** Genera el mensaje WhatsApp "Queda: / Falta:" a partir de items marcados. */
export function buildInventoryWhatsAppMessage(
  items: MessageLineItem[],
  notes?: string | null,
): string {
  const sorted = [...items].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const queda = sorted.filter(
    (i) => i.level === "suficiente" || i.level === "mitad",
  );
  const falta = sorted.filter(
    (i) => i.level === "poco" || i.level === "agotado",
  );

  const lines: string[] = [];
  lines.push("Queda:");
  if (queda.length === 0) {
    lines.push("- (nada marcado)");
  } else {
    for (const i of queda) lines.push(quedaLine(i));
  }
  lines.push("");
  lines.push("Falta:");
  if (falta.length === 0) {
    lines.push("- (nada marcado)");
  } else {
    for (const i of falta) lines.push(faltaLine(i));
  }

  const n = notes?.trim();
  if (n) {
    lines.push("");
    lines.push(n);
  }

  return lines.join("\n");
}
