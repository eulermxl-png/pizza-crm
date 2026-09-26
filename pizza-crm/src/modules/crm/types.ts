export type ClientStatus =
  | "prospecto"
  | "contactado"
  | "muestra"
  | "negociando"
  | "activo"
  | "pausado"
  | "perdido";

export const STATUSES: { key: ClientStatus; label: string; color: string }[] = [
  { key: "prospecto", label: "Prospecto", color: "var(--muted-2)" },
  { key: "contactado", label: "Contactado", color: "var(--teal)" },
  { key: "muestra", label: "Muestra", color: "var(--amber)" },
  { key: "negociando", label: "Negociando", color: "var(--violet)" },
  { key: "activo", label: "Activo", color: "var(--ok)" },
  { key: "pausado", label: "Pausado", color: "var(--warn)" },
  { key: "perdido", label: "Perdido", color: "var(--danger)" },
];

export function statusMeta(s: string) {
  return STATUSES.find((x) => x.key === s) ?? STATUSES[0];
}

export type ActivityType = "visita" | "llamada" | "whatsapp" | "muestra" | "nota";

export const ACTIVITY_TYPES: { key: ActivityType; label: string }[] = [
  { key: "visita", label: "Visita" },
  { key: "llamada", label: "Llamada" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "muestra", label: "Muestra entregada" },
  { key: "nota", label: "Nota" },
];

export type PayMethod = "efectivo" | "transferencia" | "tarjeta" | "otro";

export const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

export const BUSINESS_TYPES = [
  "Restaurante",
  "Minisuper / tienda",
  "Cafetería de oficina",
  "Bar",
  "Escuela",
  "Hotel",
  "Otro",
];

export const SOURCES = ["Referido", "Visita en frío", "Llamada", "Redes sociales", "Llegó solo", "Otro"];

/** Días sin pedido para marcar a un cliente activo "en riesgo". */
export const RISK_DAYS = 20;

export type CrmClientRow = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  status: ClientStatus;
  business_type: string | null;
  source: string | null;
  agreed_price: number | null;
  expected_weekly_qty: number | null;
  next_follow_up: string | null;
  assigned_to: string | null;
  lost_reason: string | null;
  notes: string | null;
};

export type SaleLite = {
  id: string;
  client_id: string;
  sold_at: string;
  total: number;
  amount_paid: number;
  merma: boolean;
  notes: string | null;
};

export type PaymentLite = {
  id: string;
  client_id: string;
  sale_id: string | null;
  amount: number;
  paid_at: string;
  method: string;
  notes: string | null;
};

export type Activity = {
  id: string;
  client_id: string;
  type: ActivityType;
  happened_at: string;
  result: string | null;
  next_step: string | null;
  next_follow_up: string | null;
  created_by: string | null;
};

export type Staff = { id: string; name: string; role: string };

export type ProductLite = { id: string; name: string; has_sizes: boolean };

export const money = (n: number) =>
  n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function todayYmd(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00`).getTime();
  const b = new Date(`${toYmd}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function methodLabel(m: string): string {
  return PAY_METHODS.find((x) => x.value === m)?.label ?? m;
}

export function activityLabel(t: string): string {
  return ACTIVITY_TYPES.find((x) => x.key === t)?.label ?? t;
}
