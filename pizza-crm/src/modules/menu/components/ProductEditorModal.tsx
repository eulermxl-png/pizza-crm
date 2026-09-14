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
import type { ComboComponentRow, ProductRow } from "../types";
import { purchaseUnitsFor } from "@/modules/inventory/types";

type ComboDraftRow = {
  id: string;
  component_product_id: string | null;
  component_category: string | null;
  quantity: number;
  is_fixed: boolean;
  sort_order: number;
};

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
  const [hasSizes, setHasSizes] = useState(true);
  const [isCombo, setIsCombo] = useState(false);
  const [wholesaleOnly, setWholesaleOnly] = useState(false);
  const [priceSingle, setPriceSingle] = useState("0");
  const [pricesSmall, setPricesSmall] = useState("0");
  const [pricesMedium, setPricesMedium] = useState("0");
  const [pricesLarge, setPricesLarge] = useState("0");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);
  const [comboComponents, setComboComponents] = useState<ComboDraftRow[]>([]);
  const [inventoryItems, setInventoryItems] = useState<
    { id: string; name: string; base_unit: string | null }[]
  >([]);
  const [materialLinks, setMaterialLinks] = useState<
    { id: string; item_id: string; qty: number; unit: string }[]
  >([]);

  // Canal de descuento de inventario: por receta O por materiales directos.
  const [invChannel, setInvChannel] = useState<"receta" | "materiales">(
    "materiales",
  );
  const [recipes, setRecipes] = useState<{ id: string; name: string }[]>([]);
  // recetas ligadas por talla ("small"/"medium"/"large") o "__single__".
  const [recipeLinks, setRecipeLinks] = useState<Record<string, string>>({});

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
      setHasSizes(true);
      setIsCombo(false);
      setWholesaleOnly(false);
      setPriceSingle("0");
      setPricesSmall("0");
      setPricesMedium("0");
      setPricesLarge("0");
      setImageUrl(null);
      setComboComponents([]);
      setMaterialLinks([]);
      setRecipeLinks({});
      setInvChannel("materiales");
      return;
    }

    setName(product.name);
    setCategory(product.category);
    setActive(product.active);
    setHasSizes(product.has_sizes !== false);
    setIsCombo(product.is_combo === true);
    setWholesaleOnly(product.wholesale_only === true);
    const p = product.prices.small;
    setPriceSingle(String(p));
    setPricesSmall(String(product.prices.small));
    setPricesMedium(String(product.prices.medium));
    setPricesLarge(String(product.prices.large));
    setImageUrl(product.image_url);
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("products")
        .select("id,name,category,image_url,prices,active,has_sizes,is_combo")
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setCatalogProducts([]);
        return;
      }
      setCatalogProducts(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  useEffect(() => {
    if (!open || !product || !isCombo) {
      if (!product) setComboComponents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("combo_components")
        .select(
          "id,combo_product_id,component_product_id,component_category,quantity,is_fixed,sort_order",
        )
        .eq("combo_product_id", product.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setComboComponents([]);
        return;
      }
      const mapped = ((data ?? []) as ComboComponentRow[]).map((row, index) => ({
        id: row.id,
        component_product_id: row.component_product_id,
        component_category:
          row.is_fixed === true ? null : (row.component_category ?? PRODUCT_CATEGORIES[0]),
        quantity: Math.max(1, Number(row.quantity) || 1),
        is_fixed: row.is_fixed === true,
        sort_order: Number.isFinite(row.sort_order) ? row.sort_order : index,
      }));
      setComboComponents(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product, isCombo, supabase]);

  // Materiales de inventario para el enlace directo (Fase 5)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id,name,base_unit")
        .eq("active", true)
        .order("name", { ascending: true });
      if (cancelled) return;
      setInventoryItems(
        (data ?? []) as { id: string; name: string; base_unit: string | null }[],
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Enlaces producto->material existentes
  useEffect(() => {
    if (!open || !product) {
      setMaterialLinks([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("product_materials")
        .select("id,item_id,qty,unit")
        .eq("product_id", product.id);
      if (cancelled) return;
      setMaterialLinks(
        (
          (data ?? []) as {
            id: string;
            item_id: string;
            qty: number;
            unit: string;
          }[]
        ).map((r) => ({
          id: r.id,
          item_id: r.item_id,
          qty: Number(r.qty),
          unit: r.unit,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product, supabase]);

  // Recetas activas disponibles para ligar
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("recipes")
        .select("id,name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (cancelled) return;
      setRecipes((data ?? []) as { id: string; name: string }[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Recetas ya ligadas a este producto (por talla). Si hay, el canal es receta.
  useEffect(() => {
    if (!open || !product) {
      setRecipeLinks({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("product_recipes")
        .select("size,recipe_id")
        .eq("product_id", product.id);
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as {
        size: string | null;
        recipe_id: string;
      }[]) {
        map[r.size ?? "__single__"] = r.recipe_id;
      }
      setRecipeLinks(map);
      if (Object.keys(map).length > 0) setInvChannel("receta");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product, supabase]);

  const nonSelfProducts = useMemo(
    () => catalogProducts.filter((p) => p.id !== product?.id),
    [catalogProducts, product?.id],
  );

  function addComboComponent() {
    setComboComponents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        component_product_id: null,
        component_category: PRODUCT_CATEGORIES[0],
        quantity: 1,
        is_fixed: false,
        sort_order: prev.length,
      },
    ]);
  }

  function updateComboComponent(id: string, patch: Partial<ComboDraftRow>) {
    setComboComponents((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function deleteComboComponent(id: string) {
    setComboComponents((prev) => prev.filter((row) => row.id !== id));
  }

  function addMaterialLink() {
    setMaterialLinks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), item_id: "", qty: 1, unit: "" },
    ]);
  }

  function updateMaterialLink(
    id: string,
    patch: Partial<{ item_id: string; qty: number; unit: string }>,
  ) {
    setMaterialLinks((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function deleteMaterialLink(id: string) {
    setMaterialLinks((prev) => prev.filter((row) => row.id !== id));
  }

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    let small: number;
    let medium: number;
    let large: number;

    if (hasSizes) {
      small = Number(pricesSmall);
      medium = Number(pricesMedium);
      large = Number(pricesLarge);
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
    } else {
      const one = Number(priceSingle);
      if (!Number.isFinite(one) || one < 0) {
        setError("El precio debe ser un número válido y no negativo.");
        setSaving(false);
        return;
      }
      small = medium = large = one;
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
          has_sizes: hasSizes,
          is_combo: isCombo,
          wholesale_only: wholesaleOnly,
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
            has_sizes: hasSizes,
            is_combo: isCombo,
            wholesale_only: wholesaleOnly,
          })
          .eq("id", product.id);

        if (updateError) throw updateError;
      }

      if (isCombo) {
        console.log(
          "[ProductEditorModal] Combo validation input:",
          comboComponents.map((component) => ({
            id: component.id,
            is_fixed: component.is_fixed,
            quantity_raw: component.quantity,
            quantity_parsed: Number.parseInt(String(component.quantity), 10),
            component_product_id: component.component_product_id,
            component_category: component.component_category,
          })),
        );

        const invalid = comboComponents.find((component) => {
          const quantity = Number.parseInt(String(component.quantity), 10);
          const hasValidQuantity = Number.isFinite(quantity) && quantity >= 1;
          if (component.is_fixed) {
            const hasProduct =
              typeof component.component_product_id === "string" &&
              component.component_product_id.trim().length > 0;
            return !(hasProduct && hasValidQuantity);
          }

          const hasCategory =
            typeof component.component_category === "string" &&
            component.component_category.trim().length > 0;
          return !(hasCategory && hasValidQuantity);
        });
        if (invalid) {
          throw new Error(
            "Cada componente debe tener cantidad válida y producto/categoría según su tipo.",
          );
        }
      }

      const comboProductId = id;
      const { error: deleteComboErr } = await supabase
        .from("combo_components")
        .delete()
        .eq("combo_product_id", comboProductId);
      if (deleteComboErr) throw deleteComboErr;

      if (isCombo && comboComponents.length > 0) {
        const rows = comboComponents.map((row, index) => ({
          combo_product_id: comboProductId,
          component_product_id: row.is_fixed ? row.component_product_id : null,
          component_category: row.is_fixed ? null : row.component_category,
          quantity: Math.max(1, Number(row.quantity) || 1),
          is_fixed: row.is_fixed,
          sort_order: index,
        }));
        const { error: insertComboErr } = await supabase
          .from("combo_components")
          .insert(rows);
        if (insertComboErr) throw insertComboErr;
      }

      // Inventario: un solo canal por producto. Limpiamos ambos y guardamos
      // el elegido (receta O materiales directos).
      const { error: delMatErr } = await supabase
        .from("product_materials")
        .delete()
        .eq("product_id", comboProductId);
      if (delMatErr) throw delMatErr;
      const { error: delRecErr } = await supabase
        .from("product_recipes")
        .delete()
        .eq("product_id", comboProductId);
      if (delRecErr) throw delRecErr;

      if (!isCombo && invChannel === "materiales") {
        const validLinks = materialLinks.filter(
          (l) => l.item_id && Number(l.qty) > 0 && l.unit,
        );
        if (validLinks.length > 0) {
          const { error: insMatErr } = await supabase
            .from("product_materials")
            .insert(
              validLinks.map((l) => ({
                product_id: comboProductId,
                size: null,
                item_id: l.item_id,
                qty: Number(l.qty),
                unit: l.unit,
              })),
            );
          if (insMatErr) throw insMatErr;
        }
      }

      if (!isCombo && invChannel === "receta") {
        const recRows = (
          hasSizes
            ? SIZE_KEYS.map((k) => ({
                size: k as string | null,
                recipe_id: recipeLinks[k],
              }))
            : [{ size: null as string | null, recipe_id: recipeLinks["__single__"] }]
        ).filter((r) => r.recipe_id);
        if (recRows.length > 0) {
          const { error: insRecErr } = await supabase
            .from("product_recipes")
            .insert(
              recRows.map((r) => ({
                product_id: comboProductId,
                size: r.size,
                recipe_id: r.recipe_id,
              })),
            );
          if (insRecErr) throw insRecErr;
        }
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

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface3 shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-rondaCream">
              {product ? "Editar producto" : "Nuevo producto"}
            </h3>
            <p className="mt-1 text-sm text-muted">
              Precios, tamaños opcionales e imagen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => (saving ? undefined : onClose())}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 text-sm font-semibold text-rondaCream hover:bg-surface3"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-start">
            <div className="min-w-0 space-y-4 lg:order-1">
              <div>
                <label className="mb-2 block text-sm text-muted">Nombre</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
                  placeholder="Ej. Pizza margarita"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-muted">
                  Categoría
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex min-h-[44px] items-center gap-3 text-sm text-rondaCream">
                <input
                  type="checkbox"
                  checked={hasSizes}
                  onChange={(e) => setHasSizes(e.target.checked)}
                  className="h-5 w-5 shrink-0"
                />
                ¿Tiene variaciones de tamaño?
              </label>

              {hasSizes ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {SIZE_KEYS.map((k) => (
                    <div key={k}>
                      <label className="mb-2 block text-sm text-muted">
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
                        className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm text-muted">
                    Precio
                  </label>
                  <input
                    inputMode="decimal"
                    value={priceSingle}
                    onChange={(e) => setPriceSingle(e.target.value)}
                    className="h-12 w-full max-w-xs rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
                  />
                </div>
              )}

              <label className="flex min-h-[44px] items-center gap-3 text-sm text-rondaCream">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-5 w-5 shrink-0"
                />
                Producto activo (visible para cajeros)
              </label>

              <label className="flex min-h-[44px] items-center gap-3 text-sm text-rondaCream">
                <input
                  type="checkbox"
                  checked={isCombo}
                  onChange={(e) => setIsCombo(e.target.checked)}
                  className="h-5 w-5 shrink-0"
                />
                ¿Es un combo?
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm text-rondaCream">
                <input
                  type="checkbox"
                  checked={wholesaleOnly}
                  onChange={(e) => setWholesaleOnly(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span>
                  Solo mayoreo (pizza congelada)
                  <span className="mt-0.5 block text-xs text-muted2">
                    No aparece en el POS; solo se vende en la pestaña Mayoreo.
                    Dale su propia receta en Recetas.
                  </span>
                </span>
              </label>

              {isCombo ? (
                <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-rondaCream">
                      Componentes del combo
                    </p>
                    <button
                      type="button"
                      onClick={addComboComponent}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface2 px-3 text-xs font-bold text-rondaCream hover:bg-surface3"
                    >
                      Agregar componente
                    </button>
                  </div>

                  {comboComponents.length === 0 ? (
                    <p className="text-xs text-muted2">
                      Agrega al menos un componente para este combo.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {comboComponents.map((row) => (
                        <div
                          key={row.id}
                          className="space-y-2 rounded-lg border border-line bg-surface2 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateComboComponent(row.id, {
                                    is_fixed: true,
                                    component_category: null,
                                  })
                                }
                                className={
                                  row.is_fixed
                                    ? "rounded-md border border-amber-700 bg-amber-900/30 px-2 py-1 text-xs font-bold text-amber-100"
                                    : "rounded-md border border-line bg-surface2 px-2 py-1 text-xs font-semibold text-muted"
                                }
                              >
                                Fijo
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateComboComponent(row.id, {
                                    is_fixed: false,
                                    component_product_id: null,
                                    component_category:
                                      row.component_category ?? PRODUCT_CATEGORIES[0],
                                  })
                                }
                                className={
                                  !row.is_fixed
                                    ? "rounded-md border border-amber-700 bg-amber-900/30 px-2 py-1 text-xs font-bold text-amber-100"
                                    : "rounded-md border border-line bg-surface2 px-2 py-1 text-xs font-semibold text-muted"
                                }
                              >
                                A elegir
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteComboComponent(row.id)}
                              className="rounded-md border border-red-800/70 bg-red-950/50 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-900/50"
                            >
                              Eliminar
                            </button>
                          </div>

                          {row.is_fixed ? (
                            <div>
                              <label className="mb-1 block text-xs text-muted">
                                Producto fijo
                              </label>
                              <select
                                value={row.component_product_id ?? ""}
                                onChange={(e) =>
                                  updateComboComponent(row.id, {
                                    component_product_id:
                                      e.target.value.trim() || null,
                                  })
                                }
                                className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                              >
                                <option value="">Selecciona producto</option>
                                {nonSelfProducts.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.category})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="mb-1 block text-xs text-muted">
                                Categoría a elegir
                              </label>
                              <select
                                value={row.component_category ?? PRODUCT_CATEGORIES[0]}
                                onChange={(e) =>
                                  updateComboComponent(row.id, {
                                    component_category: e.target.value,
                                  })
                                }
                                className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                              >
                                {PRODUCT_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="max-w-[11rem]">
                            <label className="mb-1 block text-xs text-muted">
                              Cantidad
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={row.quantity}
                              onChange={(e) =>
                                updateComboComponent(row.id, {
                                  quantity: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                })
                              }
                              className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {!isCombo ? (
                <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rondaCream">
                      Descuento de inventario
                    </p>
                    <p className="text-xs text-muted2">
                      Elige cómo descuenta este producto al venderse: por su
                      receta, o por materiales directos. Es uno u otro.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setInvChannel("receta")}
                      className={
                        invChannel === "receta"
                          ? "flex-1 rounded-lg bg-rondaAccent px-3 py-2 text-xs font-bold text-rondaCream"
                          : "flex-1 rounded-lg border border-line bg-surface2 px-3 py-2 text-xs font-semibold text-muted"
                      }
                    >
                      Por receta
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvChannel("materiales")}
                      className={
                        invChannel === "materiales"
                          ? "flex-1 rounded-lg bg-rondaAccent px-3 py-2 text-xs font-bold text-rondaCream"
                          : "flex-1 rounded-lg border border-line bg-surface2 px-3 py-2 text-xs font-semibold text-muted"
                      }
                    >
                      Materiales directos
                    </button>
                  </div>

                  {invChannel === "receta" ? (
                    recipes.length === 0 ? (
                      <p className="rounded-lg border border-line bg-surface2 p-2 text-xs text-amber-200">
                        Aún no hay recetas activas. Créalas en la pantalla
                        Recetas y regresa a ligarlas aquí.
                      </p>
                    ) : hasSizes ? (
                      <div className="space-y-2">
                        {SIZE_KEYS.map((k) => (
                          <div key={k}>
                            <label className="mb-1 block text-xs text-muted">
                              Receta — {SIZE_LABELS_ES[k]}
                            </label>
                            <select
                              value={recipeLinks[k] ?? ""}
                              onChange={(e) =>
                                setRecipeLinks((prev) => ({
                                  ...prev,
                                  [k]: e.target.value,
                                }))
                              }
                              className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                            >
                              <option value="">— Sin receta —</option>
                              {recipes.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-xs text-muted">
                          Receta
                        </label>
                        <select
                          value={recipeLinks["__single__"] ?? ""}
                          onChange={(e) =>
                            setRecipeLinks((prev) => ({
                              ...prev,
                              __single__: e.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                        >
                          <option value="">— Sin receta —</option>
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted2">
                        Para productos sin receta (refrescos, complementos).
                      </p>
                      <button
                        type="button"
                        onClick={addMaterialLink}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 px-3 text-xs font-bold text-rondaCream hover:bg-surface3"
                      >
                        Agregar material
                      </button>
                    </div>
                  )}

                  {invChannel !== "materiales" ? null : materialLinks.length ===
                    0 ? (
                    <p className="text-xs text-muted2">
                      Sin enlace: este producto no descuenta inventario al
                      venderse.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {materialLinks.map((row) => {
                        const item = inventoryItems.find(
                          (it) => it.id === row.item_id,
                        );
                        const unitOpts = purchaseUnitsFor(
                          item?.base_unit ?? null,
                        ).filter((u) => u.code !== "paquete");
                        return (
                          <div
                            key={row.id}
                            className="space-y-2 rounded-lg border border-line bg-surface2 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <select
                                value={row.item_id}
                                onChange={(e) => {
                                  const it = inventoryItems.find(
                                    (x) => x.id === e.target.value,
                                  );
                                  updateMaterialLink(row.id, {
                                    item_id: e.target.value,
                                    unit: it?.base_unit ?? row.unit,
                                  });
                                }}
                                className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                              >
                                <option value="">Selecciona material</option>
                                {inventoryItems.map((it) => (
                                  <option key={it.id} value={it.id}>
                                    {it.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => deleteMaterialLink(row.id)}
                                className="shrink-0 rounded-md border border-red-800/70 bg-red-950/50 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-900/50"
                              >
                                Quitar
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <div className="w-28">
                                <label className="mb-1 block text-xs text-muted">
                                  Cantidad
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={row.qty}
                                  onChange={(e) =>
                                    updateMaterialLink(row.id, {
                                      qty: Number(e.target.value) || 0,
                                    })
                                  }
                                  className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                                />
                              </div>
                              <div className="w-28">
                                <label className="mb-1 block text-xs text-muted">
                                  Unidad
                                </label>
                                <select
                                  value={row.unit}
                                  onChange={(e) =>
                                    updateMaterialLink(row.id, {
                                      unit: e.target.value,
                                    })
                                  }
                                  disabled={!row.item_id}
                                  className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream disabled:opacity-50"
                                >
                                  {unitOpts.length === 0 ? (
                                    <option value="">—</option>
                                  ) : null}
                                  {unitOpts.map((u) => (
                                    <option key={u.code} value={u.code}>
                                      {u.code}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="min-w-0 max-w-[200px] shrink-0 space-y-3 self-start lg:order-2 lg:sticky lg:top-0">
              <div>
                <label className="mb-2 block text-sm text-muted">Imagen</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    setRemoveImage(false);
                  }}
                  className="block w-full text-sm text-muted file:mr-4 file:h-11 file:rounded-lg file:border-0 file:bg-surface2 file:px-4 file:text-sm file:font-semibold file:text-rondaCream hover:file:bg-surface3"
                />
              </div>

              <label className="flex min-h-[44px] items-center gap-3 text-sm text-muted">
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
                <div className="w-full max-w-[200px] overflow-hidden rounded-lg border border-line bg-surface2">
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
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-line bg-surface3 px-5 font-semibold text-rondaCream hover:bg-surface2"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-rondaAccent px-5 font-semibold text-rondaCream transition hover:bg-rondaAccentHover disabled:opacity-60"
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
