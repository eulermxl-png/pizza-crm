import { EXPENSE_CATEGORIES } from "../constants";
import type { AuditExpense, AuditFinding } from "./auditTypes";

const money = (v: number) =>
  `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normDesc = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function dayDiff(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000,
  );
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mediana por categoría para dar contexto (también se le pasa al modelo). */
export function categoryMedians(history: Pick<AuditExpense, "category" | "amount">[]) {
  const by = new Map<string, number[]>();
  for (const h of history) {
    if (h.amount <= 0) continue;
    const list = by.get(h.category) ?? [];
    list.push(h.amount);
    by.set(h.category, list);
  }
  const out: Record<string, { mediana: number; n: number }> = {};
  by.forEach((v, k) => (out[k] = { mediana: Math.round(median(v) * 100) / 100, n: v.length }));
  return out;
}

const MIN_HISTORY = 6;
/** A partir de este monto, mismo día + mismo monto se marca aunque la categoría sea distinta. */
const SAME_DAY_MIN_AMOUNT = 200;
const OUTLIER_FACTOR = 3;
const OUTLIER_MIN_GAP = 500;

/**
 * Chequeos determinísticos: siempre dan el mismo resultado y no gastan IA.
 * `expenses` = gastos del periodo; `history` = gastos de los meses previos (para atípicos).
 */
export function runRuleChecks(
  expenses: AuditExpense[],
  history: Pick<AuditExpense, "category" | "amount">[],
  todayYmd: string,
): AuditFinding[] {
  const out: AuditFinding[] = [];
  const known = new Set<string>(EXPENSE_CATEGORIES);

  for (const e of expenses) {
    if (e.date > todayYmd) {
      out.push({
        id: `fecha-${e.id}`,
        expenseIds: [e.id],
        kind: "fecha_futura",
        severity: "review",
        title: "Fecha en el futuro",
        detail: `“${e.description}” está registrado el ${e.date}, después de hoy.`,
        source: "regla",
      });
    }
    if (!(e.amount > 0)) {
      out.push({
        id: `monto-${e.id}`,
        expenseIds: [e.id],
        kind: "monto_invalido",
        severity: "review",
        title: "Monto en cero o negativo",
        detail: `“${e.description}” tiene un monto de ${money(e.amount)}.`,
        source: "regla",
      });
    }
    if (e.description.trim().length < 3) {
      out.push({
        id: `desc-${e.id}`,
        expenseIds: [e.id],
        kind: "descripcion",
        severity: "review",
        title: "Sin descripción",
        detail: `Gasto de ${money(e.amount)} en ${e.category} del ${e.date} no dice qué se pagó.`,
        source: "regla",
      });
    }
    if (!known.has(e.category)) {
      out.push({
        id: `cat-${e.id}`,
        expenseIds: [e.id],
        kind: "categoria",
        severity: "review",
        title: "Categoría no reconocida",
        detail: `“${e.category}” no es una de las categorías del sistema.`,
        source: "regla",
      });
    }
  }

  /* Duplicados: mismo día + mismo monto, o mismo monto + misma descripción a ≤2 días */
  const grouped = new Set<string>();
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (grouped.has(a.id) || !(a.amount > 0)) continue;
    const group = [a];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (grouped.has(b.id) || b.amount !== a.amount) continue;
      if (dayDiff(a.date, b.date) > 2) continue;
      // Misma descripción a ≤2 días, o (solo gastos manuales) mismo día y mismo monto aunque
      // cambie categoría/descripción. Dos compras de inventario de insumos distintos que
      // coinciden en monto no son duplicado.
      const bothManual = !a.fromPurchase && !b.fromPurchase;
      const sameDay =
        bothManual &&
        a.date === b.date &&
        (a.category === b.category || a.amount >= SAME_DAY_MIN_AMOUNT);
      const sameDesc = normDesc(a.description) !== "" && normDesc(a.description) === normDesc(b.description);
      if (sameDay || sameDesc) group.push(b);
    }
    if (group.length > 1) {
      group.forEach((g) => grouped.add(g.id));
      out.push({
        id: `dup-${group.map((g) => g.id).join("-")}`,
        expenseIds: group.map((g) => g.id),
        kind: "duplicado",
        severity: "review",
        title: `Posible duplicado (${group.length} registros)`,
        detail: `${group.length} gastos de ${money(a.amount)}: ${group
          .map((g) => `“${g.description}” (${g.category}, ${g.date})`)
          .join(", ")}. Si es el mismo pago, borra los sobrantes.`,
        source: "regla",
      });
    }
  }

  /* Montos atípicos contra el historial de la misma categoría (solo gastos manuales) */
  const stats = categoryMedians(history);
  for (const e of expenses) {
    if (e.fromPurchase) continue;
    const s = stats[e.category];
    if (!s || s.n < MIN_HISTORY) continue;
    if (e.amount > s.mediana * OUTLIER_FACTOR && e.amount - s.mediana > OUTLIER_MIN_GAP) {
      out.push({
        id: `atip-${e.id}`,
        expenseIds: [e.id],
        kind: "monto_atipico",
        severity: "review",
        title: "Monto muy arriba de lo normal",
        detail: `“${e.description}” por ${money(e.amount)}; lo usual en ${e.category} es alrededor de ${money(
          s.mediana,
        )}. Revisa que no sobre un cero o que no sea un pago acumulado.`,
        source: "regla",
      });
    }
  }

  return out;
}
