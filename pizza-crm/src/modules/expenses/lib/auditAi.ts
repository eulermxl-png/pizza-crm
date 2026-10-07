import { AI_MODELS, claudeTool } from "@/lib/ai/anthropic";
import { EXPENSE_AUDIT_SYSTEM } from "@/lib/ai/prompts";

import { EXPENSE_CATEGORIES } from "../constants";
import type { categoryMedians } from "./auditChecks";
import type { AuditExpense, AuditFinding } from "./auditTypes";

const MAX_FOR_AI = 250;
const MAX_AI_FINDINGS = 40;


type AiItem = {
  expense_id: string;
  kind: "categoria" | "descripcion" | "otro";
  severity: "fix" | "review";
  title: string;
  detail: string;
  fix_field?: "category" | "description";
  fix_value?: string;
};

const TOOL = {
  name: "reportar_hallazgos",
  description: "Entrega la lista de gastos con errores. Lista vacía si todo está bien.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            expense_id: { type: "string" },
            kind: { type: "string", enum: ["categoria", "descripcion", "otro"] },
            severity: { type: "string", enum: ["fix", "review"] },
            title: { type: "string" },
            detail: { type: "string" },
            fix_field: { type: "string", enum: ["category", "description"] },
            fix_value: { type: "string" },
          },
          required: ["expense_id", "kind", "severity", "title", "detail"],
        },
      },
    },
    required: ["findings"],
  },
};

export async function aiFindings(
  expenses: AuditExpense[],
  medians: ReturnType<typeof categoryMedians>,
): Promise<AuditFinding[]> {
  // Solo gastos capturados a mano: las compras de inventario se corrigen desde su propia pantalla.
  const manual = expenses.filter((e) => !e.fromPurchase).slice(-MAX_FOR_AI);
  if (manual.length === 0) return [];
  const byId = new Map(manual.map((e) => [e.id, e]));

  const system = EXPENSE_AUDIT_SYSTEM.replace(
    "{{CATEGORIAS}}",
    EXPENSE_CATEGORIES.map((c) => `- ${c}`).join("\n"),
  );
  const user = [
    "Monto típico (mediana) por categoría en los últimos meses:",
    JSON.stringify(medians),
    "",
    "Gastos a revisar:",
    JSON.stringify(
      manual.map((e) => ({
        expense_id: e.id,
        fecha: e.date,
        categoria: e.category,
        descripcion: e.description,
        monto: e.amount,
      })),
    ),
  ].join("\n");

  const res = await claudeTool<{ findings?: AiItem[] }>({
    model: AI_MODELS.fast,
    system,
    user,
    tool: TOOL,
  });

  const valid = new Set<string>(EXPENSE_CATEGORIES);
  const out: AuditFinding[] = [];
  for (const it of (res.findings ?? []).slice(0, MAX_AI_FINDINGS)) {
    const exp = byId.get(it.expense_id);
    if (!exp || !it.title || !it.detail) continue;

    // Insumos y Costo de venta son equivalentes: un "cambio" entre ellas es ruido.
    const cogs = ["Insumos", "Costo de venta"];
    if (it.fix_field === "category" && cogs.includes(exp.category) && cogs.includes((it.fix_value ?? "").trim())) {
      continue;
    }

    let fix: AuditFinding["fix"];
    if (it.fix_field && typeof it.fix_value === "string") {
      const v = it.fix_value.trim();
      if (it.fix_field === "category" && valid.has(v) && v !== exp.category) {
        fix = { field: "category", value: v };
      }
      if (it.fix_field === "description" && v && v.length <= 200 && v !== exp.description.trim()) {
        fix = { field: "description", value: v };
      }
    }
    out.push({
      id: `ia-${it.kind}-${exp.id}`,
      expenseIds: [exp.id],
      kind: it.kind,
      severity: it.severity === "fix" && fix ? "fix" : "review",
      title: it.title.slice(0, 80),
      detail: it.detail.slice(0, 400),
      fix,
      source: "ia",
    });
  }
  return out;
}

