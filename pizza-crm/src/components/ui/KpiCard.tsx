import type { ReactNode } from "react";
import { Card } from "./Card";
import { cn } from "./cn";
import { TONE, type Tone } from "./tokens";

type KpiCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: Tone;
  valueTone?: Tone;
  className?: string;
};

export function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "brand",
  valueTone,
  className,
}: KpiCardProps) {
  const badge = TONE[tone];
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted2">
          {label}
        </p>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: badge.soft, color: badge.fg }}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn("nums text-3xl font-bold leading-none", !valueTone && "text-rondaCream")}
        style={valueTone ? { color: TONE[valueTone].fg } : undefined}
      >
        {value}
      </p>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </Card>
  );
}
