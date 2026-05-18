"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  SIZE_KEYS,
  SIZE_LABELS_ES,
  STANDARD_PRODUCT_SIZE,
  type ProductSizeChoice,
  type SizeKey,
} from "@/modules/menu/constants";
import type {
  ComboComponentRow,
  CustomizationRow,
  ProductRow,
} from "@/modules/menu/types";
import { INCLUDED_IN_COMBO_NOTE } from "../lib/comboItemMetadata";

type ComboSelectionLine = {
  productId: string;
  productName: string;
  quantity: number;
};

type AddLinePayload = {
  productId: string;
  productName: string;
  size: ProductSizeChoice;
  quantity: number;
  customizationNames: string[];
  unitPrice: number;
  isComboComponent?: boolean;
  comboGroupId?: string | null;
};

type Props = {
  open: boolean;
  product: ProductRow | null;
  customizationOptions: CustomizationRow[];
  catalogProducts: ProductRow[];
  onClose: () => void;
  onAdd: (payload: { lines: AddLinePayload[] }) => void;
};

export default function AddProductModal({
  open,
  product,
  customizationOptions,
  catalogProducts,
  onClose,
  onAdd,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const hasSizes = product?.has_sizes !== false;
  const [size, setSize] = useState<SizeKey>("medium");
  const [quantity, setQuantity] = useState(1);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [comboComponents, setComboComponents] = useState<ComboComponentRow[]>([]);
  const [comboLoading, setComboLoading] = useState(false);
  const [comboError, setComboError] = useState<string | null>(null);
  const [choiceBySlot, setChoiceBySlot] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !product) return;
    setSize("medium");
    setQuantity(1);
    setPicked({});
    setChoiceBySlot({});
    setComboError(null);
    setComboComponents([]);
  }, [open, product]);

  useEffect(() => {
    if (!open || !product?.is_combo) return;
    let cancelled = false;
    void (async () => {
      setComboLoading(true);
      const { data, error } = await supabase
        .from("combo_components")
        .select(
          "id,combo_product_id,component_product_id,component_category,quantity,is_fixed,sort_order",
        )
        .eq("combo_product_id", product.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (cancelled) return;
      if (error) {
        setComboError(error.message);
        setComboComponents([]);
        setComboLoading(false);
        return;
      }
      setComboComponents((data ?? []) as ComboComponentRow[]);
      setComboLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product, supabase]);

  const extrasTotal = useMemo(() => {
    if (product?.is_combo) return 0;
    return customizationOptions
      .filter((o) => picked[o.name])
      .reduce((sum, o) => sum + (o.extra_price ?? 0), 0);
  }, [customizationOptions, picked, product?.is_combo]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    if (product.is_combo) return product.prices.small ?? 0;
    if (!hasSizes) return (product.prices.small ?? 0) + extrasTotal;
    return (product.prices[size] ?? 0) + extrasTotal;
  }, [product, hasSizes, size, extrasTotal]);

  if (!open || !product) return null;
  const currentProduct = product;

  function toggleOption(name: string) {
    setPicked((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  const productsById = useMemo(
    () => new Map(catalogProducts.map((p) => [p.id, p])),
    [catalogProducts],
  );

  const dynamicSlots = useMemo(() => {
    const slots: Array<{
      slotKey: string;
      componentCategory: string;
      labelIndex: number;
      options: ProductRow[];
    }> = [];
    for (const component of comboComponents) {
      if (component.is_fixed) continue;
      const category = component.component_category?.trim() ?? "";
      const options = catalogProducts.filter(
        (p) => p.active && p.category === category,
      );
      const qty = Math.max(1, Number(component.quantity) || 1);
      for (let i = 0; i < qty; i += 1) {
        slots.push({
          slotKey: `${component.id}:${i}`,
          componentCategory: category,
          labelIndex: i + 1,
          options,
        });
      }
    }
    return slots;
  }, [comboComponents, catalogProducts]);

  const missingChoiceCount = useMemo(() => {
    if (!currentProduct.is_combo) return 0;
    return dynamicSlots.filter((slot) => !choiceBySlot[slot.slotKey]).length;
  }, [choiceBySlot, dynamicSlots, currentProduct.is_combo]);

  const canAddCombo =
    !comboLoading &&
    !comboError &&
    comboComponents.length > 0 &&
    missingChoiceCount === 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const customizationNames = currentProduct.is_combo
      ? []
      : customizationOptions
          .filter((o) => picked[o.name])
          .map((o) => o.name);

    const comboGroupId = currentProduct.is_combo ? crypto.randomUUID() : null;
    const lines: AddLinePayload[] = [
      {
        productId: currentProduct.id,
        productName: currentProduct.name,
        size:
          currentProduct.is_combo || !hasSizes ? STANDARD_PRODUCT_SIZE : size,
        quantity,
        customizationNames,
        unitPrice,
        comboGroupId,
      },
    ];

    if (currentProduct.is_combo) {
      if (!canAddCombo) return;

      const selectedComponents = new Map<string, ComboSelectionLine>();

      for (const component of comboComponents) {
        if (component.is_fixed) {
          if (!component.component_product_id) continue;
          const fixedProduct = productsById.get(component.component_product_id);
          if (!fixedProduct) continue;
          const key = fixedProduct.id;
          const current = selectedComponents.get(key);
          const nextQty = Math.max(1, Number(component.quantity) || 1);
          selectedComponents.set(key, {
            productId: fixedProduct.id,
            productName: fixedProduct.name,
            quantity: (current?.quantity ?? 0) + nextQty,
          });
          continue;
        }

        const qty = Math.max(1, Number(component.quantity) || 1);
        for (let i = 0; i < qty; i += 1) {
          const slotKey = `${component.id}:${i}`;
          const selectedId = choiceBySlot[slotKey];
          if (!selectedId) continue;
          const selected = productsById.get(selectedId);
          if (!selected) continue;
          const key = selected.id;
          const current = selectedComponents.get(key);
          selectedComponents.set(key, {
            productId: selected.id,
            productName: selected.name,
            quantity: (current?.quantity ?? 0) + 1,
          });
        }
      }

      for (const selected of Array.from(selectedComponents.values())) {
        lines.push({
          productId: selected.productId,
          productName: selected.productName,
          size: STANDARD_PRODUCT_SIZE,
          quantity: selected.quantity * quantity,
          unitPrice: 0,
          customizationNames: [INCLUDED_IN_COMBO_NOTE],
          isComboComponent: true,
          comboGroupId,
        });
      }
    }

    onAdd({ lines });
    onClose();
  }

  const canSubmit = currentProduct.is_combo ? canAddCombo : true;

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
          {!product.is_combo && hasSizes ? (
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
                        ? "min-h-[48px] rounded-lg border-2 border-rondaAccent bg-rondaAccent/20 px-2 text-sm font-semibold text-rondaCream"
                        : "min-h-[48px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm font-medium text-zinc-200 hover:border-rondaAccentHover hover:bg-zinc-800"
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
          ) : (
            <p className="text-sm text-zinc-400">
              Precio:{" "}
              <span className="font-semibold text-rondaCream tabular-nums">
                ${product.prices.small.toFixed(2)}
              </span>
            </p>
          )}

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

          {product.is_combo ? (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="text-sm font-semibold text-zinc-100">
                Componentes del combo
              </p>
              {comboLoading ? (
                <p className="text-sm text-zinc-500">Cargando componentes…</p>
              ) : comboError ? (
                <p className="text-sm text-red-300">{comboError}</p>
              ) : comboComponents.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Este combo no tiene componentes configurados.
                </p>
              ) : (
                <>
                  {comboComponents
                    .filter((component) => component.is_fixed)
                    .map((component) => {
                      const fixedProduct = component.component_product_id
                        ? productsById.get(component.component_product_id)
                        : null;
                      return (
                        <div
                          key={component.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200"
                        >
                          {Math.max(1, Number(component.quantity) || 1)}x{" "}
                          {fixedProduct?.name ?? "Producto no disponible"}{" "}
                          <span className="text-zinc-500">({INCLUDED_IN_COMBO_NOTE})</span>
                        </div>
                      );
                    })}

                  {dynamicSlots.map((slot) => (
                    <div key={slot.slotKey}>
                      <label className="mb-1 block text-xs text-zinc-400">
                        Elige {slot.componentCategory} {slot.labelIndex}
                      </label>
                      <select
                        value={choiceBySlot[slot.slotKey] ?? ""}
                        onChange={(e) =>
                          setChoiceBySlot((prev) => ({
                            ...prev,
                            [slot.slotKey]: e.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                      >
                        <option value="">Seleccionar producto</option>
                        {slot.options.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {missingChoiceCount > 0 ? (
                    <p className="text-xs text-amber-300">
                      Completa todas las selecciones para añadir el combo.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {!product.is_combo && customizationOptions.length > 0 ? (
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
                      <span className="shrink-0 text-xs font-semibold text-rondaCream">
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
            <span className="font-bold text-rondaCream tabular-nums">
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
              disabled={!canSubmit}
              className="h-12 flex-1 rounded-lg bg-rondaAccent px-4 font-semibold text-rondaCream transition hover:bg-rondaAccentHover"
            >
              Añadir al pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
