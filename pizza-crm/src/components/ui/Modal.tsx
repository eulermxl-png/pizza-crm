"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { IconX } from "./icons";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeDisabled?: boolean;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  closeDisabled = false,
  className,
}: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !closeDisabled && onClose()}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-t-3xl border border-line bg-surface p-5 shadow-card sm:rounded-3xl",
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-rondaCream">{title}</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => !closeDisabled && onClose()}
            disabled={closeDisabled}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-rondaCream disabled:opacity-40"
          >
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
