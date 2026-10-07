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
