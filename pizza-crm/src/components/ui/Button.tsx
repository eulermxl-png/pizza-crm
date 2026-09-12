import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "dangerSoft"
  | "success";
type Size = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-[#241a12] hover:bg-brandHover",
  secondary:
    "border border-line bg-surface2 text-rondaCream hover:bg-surface3 hover:border-lineStrong",
  ghost: "text-muted hover:bg-surface2 hover:text-rondaCream",
  danger:
    "text-white hover:brightness-110 [background:var(--danger)]",
  dangerSoft:
    "border font-semibold hover:brightness-110 [background:var(--danger-soft)] [border-color:color-mix(in_srgb,var(--danger)_45%,transparent)] [color:var(--danger)]",
  success:
    "text-[#06281b] hover:brightness-110 [background:var(--ok)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-xs gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  );
}
