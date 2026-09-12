import { cn } from "./cn";
import { TONE, type Tone } from "./tokens";

type ProgressProps = {
  value: number; // 0..100
  tone?: Tone;
  className?: string;
};

export function Progress({ value, tone = "brand", className }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface3",
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: TONE[tone].fg }}
      />
    </div>
  );
}
