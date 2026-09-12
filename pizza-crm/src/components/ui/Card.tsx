import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

export function Card({ className, padded = true, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-card",
        padded && "p-5",
        className,
      )}
      {...rest}
    />
  );
}

type SectionProps = {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Section({ title, action, className, children }: SectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-rondaCream">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
