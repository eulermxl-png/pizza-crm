"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import {
  PRODUCT_CATEGORIES,
  SIZE_KEYS,
  SIZE_LABELS_ES,
} from "../constants";
import { uploadProductImage } from "../lib/uploadProductImage";
import { pricesToJson } from "../lib/prices";
import type { ProductRow } from "../types";

type Props = {
  open: boolean;
  product: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ProductEditorModal({
  open,
  product,
  onClose,
  onSaved,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [active, setActive] = useState(true);
  const [pricesSmall, setPricesSmall] = useState("0");
  const [pricesMedium, setPricesMedium] = useState("0");
  const [pricesLarge, setPricesLarge] = useState("0");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setFile(null);
    setRemoveImage(false);

    if (!product) {
      setName("");
      setCategory(PRODUCT_CATEGORIES[0]);
      setActive(true);
      setPricesSmall("0");
      setPricesMedium("0");
      setPricesLarge("0");
      setImageUrl(null);
      return;
    }

    setName(product.name);
    setCategory(product.category);
    setActive(product.active);
    setPricesSmall(String(product.prices.small));
    setPricesMedium(String(product.prices.medium));
    setPricesLarge(String(product.prices.large));
    setImageUrl(product.image_url);
  }, [open, product]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const small = Number(pricesSmall);
    const medium = Number(pricesMedium);
    const large = Number(pricesLarge);

    if (
      !Number.isFinite(small) ||
      !Number.isFinite(medium) ||
      !Number.isFinite(large)
    ) {
      setError("Los precios deben ser números válidos.");
      setSaving(false);
      return;
    }

    if (small < 0 || medium < 0 || large < 0) {
      setError("Los precios no pueden ser negativos.");
      setSaving(false);
      return;
    }

    const nextPrices = { small, medium, large };
    const pricesPayload = pricesToJson(nextPrices);

    try {
      const id = product?.id ?? crypto.randomUUID();

      let finalImageUrl: string | null =
        removeImage ? null : (product?.image_url ?? null);

      if (file) {
        finalImageUrl = await uploadProductImage(id, file);
      }

      if (!product) {
        const { error: insertError } = await supabase.from("products").insert({
          id,
          name: name.trim(),
          category,
          image_url: finalImageUrl,
          prices: pricesPayload,
          active,
        });

        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from("products")
          .update({
            name: name.trim(),
            category,
            image_url: finalImageUrl,
            prices: pricesPayload,
            active,
          })
          .eq("id", product.id);

        if (updateError) throw updateError;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el producto. Intenta de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        disabled={saving}
        className="absolute inset-0 bg-black/60 disabled:cursor-not-allowed"
        onClick={() => {
          if (saving) return;
          onClose();
        }}
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 p-5">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-zinc-50">
              {product ? "Editar producto" : "Nuevo producto"}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Precios por tamaño y opción de imagen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => (saving ? undefined : onClose())}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-start">
            <div className="min-w-0 space-y-4 lg:order-1">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Nombre</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
                  placeholder="Ej. Pizza margarita"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Categoría
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {SIZE_KEYS.map((k) => (
                  <div key={k}>
                    <label className="mb-2 block text-sm text-zinc-300">
                      {SIZE_LABELS_ES[k]} ({k})
                    </label>
                    <input
                      inputMode="decimal"
                      value={
                        k === "small"
                          ? pricesSmall
                          : k === "medium"
                            ? pricesMedium
                            : pricesLarge
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (k === "small") setPricesSmall(v);
                        if (k === "medium") setPricesMedium(v);
                        if (k === "large") setPricesLarge(v);
                      }}
                      className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
                    />
                  </div>
                ))}
              </div>

              <label className="flex min-h-[44px] items-center gap-3 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-5 w-5 shrink-0"
                />
                Producto activo (visible para cajeros)
              </label>
            </div>

            <div className="min-w-0 max-w-[200px] shrink-0 space-y-3 self-start lg:order-2 lg:sticky lg:top-0">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Imagen</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    setRemoveImage(false);
                  }}
                  className="block w-full text-sm text-zinc-300 file:mr-4 file:h-11 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:text-sm file:font-semibold file:text-zinc-100 hover:file:bg-zinc-800"
                />
              </div>

              <label className="flex min-h-[44px] items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={removeImage}
                  onChange={(e) => {
                    setRemoveImage(e.target.checked);
                    if (e.target.checked) setFile(null);
                  }}
                  className="h-5 w-5 shrink-0"
                />
                Quitar imagen actual
              </label>

              {!removeImage && (filePreviewUrl || imageUrl) ? (
                <div className="w-full max-w-[200px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
                  {/* English: bounded box + cover so preview never expands the modal */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={name || "Vista previa del producto"}
                    src={filePreviewUrl ?? imageUrl ?? ""}
                    className="block h-[200px] max-h-[200px] w-full object-cover object-center"
                  />
                </div>
              ) : null}
            </div>

            <div className="min-w-0 space-y-4 lg:col-span-2 lg:order-3">
              {error ? (
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => (saving ? undefined : onClose())}
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 px-5 font-semibold text-zinc-200 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-orange-500 px-5 font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
