export type AuditKind =
  | "duplicado"
  | "monto_atipico"
  | "fecha_futura"
  | "monto_invalido"
  | "descripcion"
  | "categoria"
  | "otro";

/** fix = corrección obvia que el usuario aplica con un clic · review = la revisa una persona */
export type AuditSeverity = "fix" | "review";

export type AuditFix = { field: "category" | "description"; value: string };

export type AuditFinding = {
  id: string;
  expenseIds: string[];
  kind: AuditKind;
  severity: AuditSeverity;
  title: string;
  detail: string;
  fix?: AuditFix;
  source: "regla" | "ia";
};

export type AuditResponse = {
  findings: AuditFinding[];
  /** Avisos que alguien ya marcó como "Está bien así" (no se muestran salvo que se pida). */
  dismissed: (AuditFinding & { dismissedAt: string })[];
  revisados: number;
  ia: "ok" | "sin_llave" | "error";
  iaError?: string;
};

export type AuditExpense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  fromPurchase: boolean;
};

/**
 * Llave estable de un aviso: tipo + gastos involucrados (ordenados).
 * Los avisos de IA comparten llave por gasto aunque el modelo cambie el tipo
 * (categoria/descripcion/otro), para que una decisión no reaparezca con otro nombre.
 */
export function auditKey(f: Pick<AuditFinding, "kind" | "expenseIds" | "source">): string {
  const ids = [...f.expenseIds].sort().join(",");
  return `${f.source === "ia" ? "ia" : f.kind}:${ids}`;
}
