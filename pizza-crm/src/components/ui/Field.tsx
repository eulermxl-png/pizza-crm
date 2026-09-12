import type { ReactNode } from "react";

export const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface3 px-3 text-rondaCream placeholder:text-muted2 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-[color:var(--brand-soft)]";

export const selectCls = inputCls;

type FieldProps = {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium text-muted2"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
