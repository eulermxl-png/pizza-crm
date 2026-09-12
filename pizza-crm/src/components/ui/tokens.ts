export type Tone = "brand" | "ok" | "warn" | "danger" | "teal" | "amber";

// Cada tono mapea a su color sólido (fg) y su versión suave translúcida (soft),
// definidos como variables CSS en globals.css. Los estados ok/warn/danger
// conservan el significado del semáforo — no usarlos como adorno.
export const TONE: Record<Tone, { fg: string; soft: string }> = {
  brand: { fg: "var(--brand)", soft: "var(--brand-soft)" },
  amber: { fg: "var(--amber)", soft: "var(--amber-soft)" },
  teal: { fg: "var(--teal)", soft: "var(--teal-soft)" },
  ok: { fg: "var(--ok)", soft: "var(--ok-soft)" },
  warn: { fg: "var(--warn)", soft: "var(--warn-soft)" },
  danger: { fg: "var(--danger)", soft: "var(--danger-soft)" },
};
