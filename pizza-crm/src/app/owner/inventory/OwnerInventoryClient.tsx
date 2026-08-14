"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  INVENTORY_CATEGORIES,
  type InventoryItem,
} from "@/modules/inventory/types";

export default function OwnerInventoryClient() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase
      .from("inventory_items")
      .select("id,name,category,sort_order,active")
      .order("sort_order", { ascending: true });
    if (!showInactive) q = q.eq("active", true);
    const { data, error: qErr } = await q;
    if (qErr) {
      setError(qErr.message);
      setItems([]);
    } else {
      setItems((data ?? []) as InventoryItem[]);
    }
    setLoading(false);
  }, [supabase, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveItem(
    id: string,
    patch: Partial<Pick<InventoryItem, "name" | "category" | "sort_order" | "active">>,
  ) {
    setBusyId(id);
    setError(null);
    const { error: uErr } = await supabase
      .from("inventory_items")
      .update(patch)
      .eq("id", id);
    if (uErr) setError(uErr.message);
    setBusyId(null);
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50">Insumos</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Administra la lista del checklist de cocina. Desactivar en lugar de
            borrar.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Orden</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-800/60">
                  <td className="px-3 py-2">
                    <input
                      defaultValue={it.name}
                      disabled={busyId === it.id}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== it.name) {
                          void saveItem(it.id, { name: v });
                        }
                      }}
                      className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.category}
                      disabled={busyId === it.id}
                      onChange={(e) =>
                        void saveItem(it.id, { category: e.target.value })
                      }
                      className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                    >
                      {[
                        ...INVENTORY_CATEGORIES,
                        ...(INVENTORY_CATEGORIES as readonly string[]).includes(
                          it.category,
                        )
                          ? []
                          : [it.category],
                      ].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      defaultValue={it.sort_order}
                      disabled={busyId === it.id}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n !== it.sort_order) {
                          void saveItem(it.id, { sort_order: n });
                        }
                      }}
                      className="h-10 w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={busyId === it.id}
                      onClick={() =>
                        void saveItem(it.id, { active: !it.active })
                      }
                      className={
                        it.active
                          ? "rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200"
                          : "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-400"
                      }
                    >
                      {it.active ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
