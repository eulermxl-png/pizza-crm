"use client";

import { useEffect, useMemo, useState } from "react";

import {
  SIZE_KEYS,
  SIZE_LABELS_ES,
  type SizeKey,
} from "@/modules/menu/constants";
import type { CustomizationRow, ProductRow } from "@/modules/menu/types";

type Props = {
  open: boolean;
  product: ProductRow | null;
  customizationOptions: CustomizationRow[];
  onClose: () => void;
  onAdd: (payload: {
    size: SizeKey;
    quantity: number;
    customizationNames: string[];
  }) => void;
};

export default function AddProductModal({
  open,
  product,
  customizationOptions,
  onClose,
  onAdd,
}: Props) {
  const [size, setSize] = useState<SizeKey>("medium");
  const [quantity, setQuantity] = useState(1);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !product) return;
    setSize("medium");
    setQuantity(1);
    setPicked({});
  }, [open, product]);

  const extrasTotal = useMemo(() => {
    return customizationOptions
      .filter((o) => picked[o.name])
      .reduce((sum, o) => sum + (o.extra_price ?? 0), 0);
  }, [customizationOptions, picked]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return (product.prices[size] ?? 0) + extrasTotal;
  }, [product, size, extrasTotal]);

  if (!open || !product) return null;

  function toggleOption(name: string) {
    setPicked((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const customizationNames = customizationOptions
      .filter((o) => picked[o.name])
      .map((o) => o.name);
    onAdd({ size, quantity, customizationNames });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-50">{product.name}</h3>
            <p className="text-sm text-zinc-400">{product.category}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-semibold text-zinc-200"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-300">Tamaño</p>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSize(k)}
                  className={
                    size === k
                      ? "min-h-[48px] rounded-lg border-2 border-orange-500 bg-orange-500/10 px-2 text-sm font-semibold text-orange-300"
                      : "min-h-[48px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
                  }
                >
                  <span className="block">{SIZE_LABELS_ES[k]}</span>
                  <span className="block text-xs text-zinc-400">
                    ${product.prices[k].toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-300">Cantidad</label>
            <input
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100"
            />
          </div>

          {customizationOptions.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-300">
                Personalización
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 p-3">
                {customizationOptions.map((o) => (
                  <label
                    key={o.id}
                    className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 text-sm text-zinc-200"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!!picked[o.name]}
                        onChange={() => toggleOption(o.name)}
                        className="h-5 w-5"
                      />
                      {o.name}
                    </span>
                    {(o.extra_price ?? 0) > 0 ? (
                      <span className="shrink-0 text-xs font-semibold text-orange-400">
                        +${(o.extra_price ?? 0).toFixed(2)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-zinc-600">—</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
            Precio unitario:{" "}
            <span className="font-bold text-orange-400">
              ${unitPrice.toFixed(2)}
            </span>
            {quantity > 1 ? (
              <span className="text-zinc-500">
                {" "}
                × {quantity} = ${(unitPrice * quantity).toFixed(2)}
              </span>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-lg border border-zinc-700 font-semibold text-zinc-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="h-12 flex-1 rounded-lg bg-orange-500 font-semibold text-zinc-950 hover:bg-orange-400"
            >
              Añadir al pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
