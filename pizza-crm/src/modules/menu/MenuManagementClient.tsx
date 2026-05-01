"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  loadQueryWithEmptyRetry,
  waitForClientAuthSession,
} from "@/lib/supabase/menuDataFetch";

import CustomizationPanel from "./components/CustomizationPanel";
import ProductEditorModal from "./components/ProductEditorModal";
import ProductGrid from "./components/ProductGrid";
import { PRODUCT_CATEGORIES } from "./constants";
import { useMenuRealtimeSync } from "./hooks/useMenuRealtimeSync";
import { mapCustomizationFromDb, mapProductFromDb } from "./lib/mapRow";
import type { CustomizationRow, ProductRow } from "./types";

type Tab = "products" | "customizations";

export default function MenuManagementClient() {
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<Tab>("products");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customizations, setCustomizations] = useState<CustomizationRow[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    const { data, error: qError } = await supabase
      .from("products")
      .select("id,name,category,image_url,prices,active,has_sizes")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (qError) {
      setError(qError.message);
      return;
    }

    setProducts((data ?? []).map(mapProductFromDb));
  }, [supabase]);

  const loadCustomizations = useCallback(async () => {
    const { data, error: qError } = await supabase
      .from("customization_options")
      .select("id,name,active,extra_price")
      .order("name", { ascending: true });

    if (qError) {
      setError(qError.message);
      return;
    }

    setCustomizations((data ?? []).map(mapCustomizationFromDb));
  }, [supabase]);

  const reloadAll = useCallback(async () => {
    setError(null);
    await waitForClientAuthSession(supabase);
    const [pRes, cRes] = await Promise.all([
      loadQueryWithEmptyRetry(
        () =>
          supabase
            .from("products")
            .select("id,name,category,image_url,prices,active,has_sizes")
            .order("category", { ascending: true })
            .order("name", { ascending: true }),
        (data) => !data || data.length === 0,
      ),
      loadQueryWithEmptyRetry(
        () =>
          supabase
            .from("customization_options")
            .select("id,name,active,extra_price")
            .order("name", { ascending: true }),
        (data) => !data || data.length === 0,
      ),
    ]);

    if (pRes.error) {
      setError(pRes.error.message);
      return;
    }
    if (cRes.error) {
      setError(cRes.error.message);
      return;
    }

    setProducts((pRes.data ?? []).map(mapProductFromDb));
    setCustomizations((cRes.data ?? []).map(mapCustomizationFromDb));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      await reloadAll();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadAll]);

  useMenuRealtimeSync(loadProducts, loadCustomizations);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "ALL") return products;
    return products.filter((p) => p.category === categoryFilter);
  }, [categoryFilter, products]);

  async function toggleProductActive(p: ProductRow) {
    setBusyProductId(p.id);
    setError(null);

    const { error: uError } = await supabase
      .from("products")
      .update({ active: !p.active })
      .eq("id", p.id);

    setBusyProductId(null);

    if (uError) {
      setError(uError.message);
      return;
    }

    await loadProducts();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-1">
          <button
            type="button"
            onClick={() => setTab("products")}
            className={
              tab === "products"
                ? "inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 font-semibold text-zinc-50 sm:flex-none"
                : "inline-flex h-11 flex-1 items-center justify-center rounded-lg px-4 font-semibold text-zinc-400 hover:text-zinc-200 sm:flex-none"
            }
          >
            Productos
          </button>
          <button
            type="button"
            onClick={() => setTab("customizations")}
            className={
              tab === "customizations"
                ? "inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 font-semibold text-zinc-50 sm:flex-none"
                : "inline-flex h-11 flex-1 items-center justify-center rounded-lg px-4 font-semibold text-zinc-400 hover:text-zinc-200 sm:flex-none"
            }
          >
            Personalizaciones
          </button>
        </div>

        {tab === "products" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm text-zinc-300">Categoría</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-11 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
            >
              <option value="ALL">Todas</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-rondaAccent px-4 font-semibold text-rondaCream hover:bg-rondaAccentHover"
            >
              Agregar producto
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Algo salió mal: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-8 text-center text-zinc-300">
          <p className="font-semibold text-zinc-100">Cargando menú…</p>
          <p className="mt-2 text-sm text-zinc-500">
            Conectando la sesión y cargando datos. Si la lista viene vacía, se
            reintenta automáticamente.
          </p>
        </div>
      ) : tab === "products" ? (
        <ProductGrid
          products={filteredProducts}
          busyId={busyProductId}
          onEdit={(p) => {
            setEditing(p);
            setEditorOpen(true);
          }}
          onToggleActive={(p) => void toggleProductActive(p)}
        />
      ) : (
        <CustomizationPanel
          initial={customizations}
          onChanged={() => void reloadAll()}
        />
      )}

      <ProductEditorModal
        open={editorOpen}
        product={editing}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={() => void reloadAll()}
      />
    </div>
  );
}
