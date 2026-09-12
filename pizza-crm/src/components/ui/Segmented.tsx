import { cn } from "./cn";

type Option<T extends string> = { key: T; label: string };

type SegmentedProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (key: T) => void;
  size?: "sm" | "md";
  className?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "rounded-full font-semibold transition-colors",
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
              active
                ? "bg-brand text-[#241a12]"
                : "text-muted hover:text-rondaCream",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
