// English: shared labels and transitions for pending → preparing → ready → delivered.

export type OrderPipelineStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "delivered";

export const ACTIVE_PIPELINE_STATUSES: readonly OrderPipelineStatus[] = [
  "pending",
  "preparing",
  "ready",
] as const;

export function shortOrderCode(id: string): string {
  return id.replace(/-/g, "").toUpperCase().slice(-6);
}

export function parseOrderPipelineStatus(
  raw: string,
): OrderPipelineStatus | null {
  if (
    raw === "pending" ||
    raw === "preparing" ||
    raw === "ready" ||
    raw === "delivered"
  ) {
    return raw;
  }
  return null;
}

export function isActivePipelineStatus(status: OrderPipelineStatus): boolean {
  return (ACTIVE_PIPELINE_STATUSES as readonly string[]).includes(status);
}

/** Short labels for compact UIs (e.g. cashier strip). */
export function orderStatusBadgeCompact(status: OrderPipelineStatus): string {
  switch (status) {
    case "pending":
      return "Nuevo";
    case "preparing":
      return "Preparando";
    case "ready":
      return "Listo";
    case "delivered":
      return "Entregado";
    default:
      return status;
  }
}

/** Kitchen board copy (slightly longer ready state). */
export function orderStatusBadgeKitchen(status: OrderPipelineStatus): string {
  switch (status) {
    case "pending":
      return "Nuevo";
    case "preparing":
      return "En preparación";
    case "ready":
      return "Listo para entregar";
    case "delivered":
      return "Entregado";
    default:
      return status;
  }
}

export function nextOrderStatusAction(
  status: OrderPipelineStatus,
): { next: OrderPipelineStatus; label: string } | null {
  switch (status) {
    case "pending":
      return { next: "preparing", label: "Preparando" };
    case "preparing":
      return { next: "ready", label: "Listo" };
    case "ready":
      return { next: "delivered", label: "Entregado" };
    default:
      return null;
  }
}
