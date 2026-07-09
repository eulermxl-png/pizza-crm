export const STALE_ACTIVITY_MS = 3 * 60 * 60 * 1000;
export const STALE_ACTIVITY_BADGE = "⚠ Sin movimiento 3h+";
export const STALE_ACTIVITY_BORDER = "#f59e0b";

export function isStaleActivity(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= STALE_ACTIVITY_MS;
}
