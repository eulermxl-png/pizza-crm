"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { purchaseUnitsFor } from "@/modules/inventory/types";

type InventoryItemLite = { id: string; name: string; base_unit: string | null };

type PackLink = {
  id: string;
  item_id: string;
  qty: number;
  unit: string;
  per_unit: "pizza" | "order";
};

export default function PackagingManager() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItemLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id,name,base_unit")
        .eq("active", true)
        .order("name", { ascending: true });
      if (cancelled) return;
      setItems((data ?? []) as InventoryItemLite[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-rondaCream">Empaque por servicio</h3>
        <p className="mt-1 text-sm text-muted">
          Materiales que se descuentan según el tipo de servicio (no van en la
          receta). &quot;Por pizza&quot; se multiplica por el número de pizzas de
          la orden; &quot;por orden&quot; se descuenta una vez.
        </p>
      </div>
      {loading ? (
        <p className="text-muted">Cargando…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <PackagingSet
            takeout={false}
            title="Comer aquí"
            hint="Platos, cubiertos, servilletas…"
            items={items}
          />
          <PackagingSet
            takeout={true}
            title="Para llevar"
            hint="Cajas, bolsas, recipientes…"
            items={items}
          />
        </div>
      )}
    </div>
  );
}

function PackagingSet({
  takeout,
  title,
  hint,
  items,
}: {
  takeout: boolean;
  title: string;
  hint: string;
  items: InventoryItemLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<PackLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("packaging_materials")
      .select("id,item_id,qty,unit,per_unit")
      .eq("takeout", takeout);
    if (qErr) {
      setError(qErr.message);
      setLinks([]);
    } else {
      setLinks(
        ((data ?? []) as PackLink[]).map((r) => ({
          id: r.id,
          item_id: r.item_id,
          qty: Number(r.qty),
          unit: r.unit,
          per_unit: r.per_unit === "pizza" ? "pizza" : "order",
        })),
      );
    }
    setLoading(false);
  }, [supabase, takeout]);

  useEffect(() => {
    void load();
  }, [load]);

  function addRow() {
    setSavedNote(false);
    setLinks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        item_id: "",
        qty: 1,
        unit: "",
        per_unit: "pizza",
      },
    ]);
  }
  function updateRow(id: string, patch: Partial<PackLink>) {
    setSavedNote(false);
    setLinks((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setSavedNote(false);
    setLinks((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const { error: delErr } = await supabase
        .from("packaging_materials")
        .delete()
        .eq("takeout", takeout);
      if (delErr) throw delErr;
      const valid = links.filter(
        (l) => l.item_id && Number(l.qty) > 0 && l.unit,
      );
      if (valid.length > 0) {
        const { error: insErr } = await supabase
          .from("packaging_materials")
          .insert(
            valid.map((l) => ({
              takeout,
              item_id: l.item_id,
              qty: Number(l.qty),
              unit: l.unit,
              per_unit: l.per_unit,
            })),
          );
        if (insErr) throw insErr;
      }
      setSavedNote(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-rondaCream">{title}</p>
          <p className="text-xs text-muted2">{hint}</p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 px-3 text-xs font-bold text-rondaCream hover:bg-surface3"
        >
          Agregar material
        </button>
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {loading ? (
        <p className="text-xs text-muted2">Cargando…</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted2">Sin materiales en este juego.</p>
      ) : (
        <div className="space-y-3">
          {links.map((row) => {
            const item = items.find((it) => it.id === row.item_id);
            const unitOpts = purchaseUnitsFor(item?.base_unit ?? null).filter(
              (u) => u.code !== "paquete",
            );
            return (
              <div
                key={row.id}
                className="space-y-2 rounded-lg border border-line bg-surface2 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={row.item_id}
                    onChange={(e) => {
                      const it = items.find((x) => x.id === e.target.value);
                      updateRow(row.id, {
                        item_id: e.target.value,
                        unit: it?.base_unit ?? row.unit,
                      });
                    }}
                    className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                  >
                    <option value="">Selecciona material</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="shrink-0 rounded-md border border-red-800/70 bg-red-950/50 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-900/50"
                  >
                    Quitar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-muted">Cantidad</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.qty}
                      onChange={(e) =>
                        updateRow(row.id, { qty: Number(e.target.value) || 0 })
                      }
                      className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-muted">Unidad</label>
                    <select
                      value={row.unit}
                      onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                      disabled={!row.item_id}
                      className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream disabled:opacity-50"
                    >
                      {unitOpts.length === 0 ? <option value="">—</option> : null}
                      {unitOpts.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-xs text-muted">Se cuenta</label>
                    <select
                      value={row.per_unit}
                      onChange={(e) =>
                        updateRow(row.id, {
                          per_unit: e.target.value === "pizza" ? "pizza" : "order",
                        })
                      }
                      className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
                    >
                      <option value="pizza">Por pizza</option>
                      <option value="order">Por orden</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-rondaAccent px-4 text-sm font-semibold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar juego"}
        </button>
        {savedNote ? (
          <span className="text-xs font-semibold" style={{ color: "var(--ok)" }}>
            Guardado
          </span>
        ) : null}
      </div>
    </div>
  );
}
