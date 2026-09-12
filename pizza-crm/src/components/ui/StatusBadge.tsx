import { cn } from "./cn";
import { TONE, type Tone } from "./tokens";

type StatusBadgeProps = {
  tone: Extract<Tone, "ok" | "warn" | "danger">;
  label: string;
  className?: string;
};

export function StatusBadge({ tone, label, className }: StatusBadgeProps) {
  const c = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: c.soft, color: c.fg }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: c.fg }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
