"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { purchaseUnitsFor } from "@/modules/inventory/types";

import type { CustomizationRow } from "../types";

type InventoryItemLite = { id: string; name: string; base_unit: string | null };

type Props = {
  initial: CustomizationRow[];
  onChanged: () => void;
};

export default function CustomizationPanel({ initial, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [newName, setNewName] = useState("");
  const [newExtraPrice, setNewExtraPrice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemLite[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id,name,base_unit")
        .eq("active", true)
        .order("name", { ascending: true });
      if (cancelled) return;
      setInventoryItems((data ?? []) as InventoryItemLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function addOption(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = newName.trim();
    if (!name) return;

    const extra = Math.max(0, Number(newExtraPrice) || 0);

    const { error } = await supabase.from("customization_options").insert({
      name,
      active: true,
      extra_price: extra,
    });

    if (error) {
      setError(
        error.code === "23505"
          ? "Ya existe una opción con ese nombre."
          : error.message,
      );
      return;
    }

    setNewName("");
    setNewExtraPrice("");
    onChanged();
  }

  async function toggleActive(row: CustomizationRow) {
    setBusyId(row.id);
    setError(null);

    const { error } = await supabase
      .from("customization_options")
      .update({ active: !row.active })
      .eq("id", row.id);

    setBusyId(null);

    if (error) {
      setError(error.message);
      return;
    }

    onChanged();
  }

  async function saveRow(row: CustomizationRow, name: string, extraPrice: number) {
    const nextName = name.trim();
    if (!nextName) return;

    setBusyId(row.id);
    setError(null);

    const { error } = await supabase
      .from("customization_options")
      .update({
        name: nextName,
        extra_price: Math.max(0, extraPrice),
      })
      .eq("id", row.id);

    setBusyId(null);

    if (error) {
      setError(
        error.code === "23505"
          ? "Ya existe una opción con ese nombre."
          : error.message,
      );
      return;
    }

    onChanged();
  }

  const rows = initial;

  return (
    <div className="space-y-4">
      <form
        onSubmit={addOption}
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:flex-row lg:items-end"
      >
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-sm text-muted">
            Nueva opción
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='Ej. "Queso extra"'
            className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
          />
        </div>
        <div className="w-full lg:w-40">
          <label className="mb-2 block text-sm text-muted">
            Precio extra ($)
          </label>
          <input
            value={newExtraPrice}
            onChange={(e) => setNewExtraPrice(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="h-12 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-rondaAccent px-5 font-semibold text-rondaCream hover:bg-rondaAccentHover"
        >
          Agregar
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          Todavía no hay opciones. El cajero las verá como casillas al agregar
          productos.
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Precio extra</th>
                <th className="px-4 py-3">Activa</th>
                <th className="px-4 py-3">Inventario</th>
                <th className="px-4 py-3">Guardar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <CustomizationRowEditor
                  key={r.id}
                  row={r}
                  busy={busyId === r.id}
                  expanded={expandedId === r.id}
                  inventoryItems={inventoryItems}
                  onToggleExpand={() =>
                    setExpandedId((cur) => (cur === r.id ? null : r.id))
                  }
                  onSave={(name, extra) => void saveRow(r, name, extra)}
                  onToggle={() => void toggleActive(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomizationRowEditor({
  row,
  busy,
  expanded,
  inventoryItems,
  onToggleExpand,
  onSave,
  onToggle,
}: {
  row: CustomizationRow;
  busy: boolean;
  expanded: boolean;
  inventoryItems: InventoryItemLite[];
  onToggleExpand: () => void;
  onSave: (name: string, extraPrice: number) => void;
  onToggle: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [extraPrice, setExtraPrice] = useState(String(row.extra_price));

  useEffect(() => {
    setName(row.name);
    setExtraPrice(String(row.extra_price));
  }, [row.id, row.name, row.extra_price]);

  return (
    <>
      <tr className="bg-surface">
        <td className="px-4 py-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={extraPrice}
            onChange={(e) => setExtraPrice(e.target.value)}
            inputMode="decimal"
            className="h-11 w-full max-w-[140px] rounded-lg border border-line bg-surface3 px-3 text-rondaCream outline-none focus:border-brand"
          />
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onToggle}
            className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-lg border border-line bg-surface2 px-3 font-semibold text-rondaCream hover:bg-surface3 disabled:opacity-60"
          >
            {row.active ? "Desactivar" : "Activar"}
          </button>
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-lg border border-line bg-surface2 px-3 font-semibold text-rondaCream hover:bg-surface3"
          >
            {expanded ? "Ocultar" : "Inventario"}
          </button>
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSave(name, Math.max(0, Number(extraPrice) || 0))
            }
            className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-lg bg-surface2 px-3 font-semibold text-rondaCream hover:bg-surface3 disabled:opacity-60"
          >
            Guardar
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-surface2">
          <td colSpan={5} className="px-4 py-3">
            <CustomizationMaterialsEditor
              customizationId={row.id}
              inventoryItems={inventoryItems}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

type MaterialLink = { id: string; item_id: string; qty: number; unit: string };

function CustomizationMaterialsEditor({
  customizationId,
  inventoryItems,
}: {
  customizationId: string;
  inventoryItems: InventoryItemLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<MaterialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("customization_materials")
      .select("id,item_id,qty,unit")
      .eq("customization_id", customizationId);
    if (qErr) {
      setError(qErr.message);
      setLinks([]);
      setLoading(false);
      return;
    }
    setLinks(
      ((data ?? []) as MaterialLink[]).map((r) => ({
        id: r.id,
        item_id: r.item_id,
        qty: Number(r.qty),
        unit: r.unit,
      })),
    );
    setLoading(false);
  }, [supabase, customizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  function addLink() {
    setSavedNote(false);
    setLinks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), item_id: "", qty: 1, unit: "" },
    ]);
  }

  function updateLink(id: string, patch: Partial<MaterialLink>) {
    setSavedNote(false);
    setLinks((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function deleteLink(id: string) {
    setSavedNote(false);
    setLinks((prev) => prev.filter((row) => row.id !== id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const { error: delErr } = await supabase
        .from("customization_materials")
        .delete()
        .eq("customization_id", customizationId);
      if (delErr) throw delErr;

      const valid = links.filter(
        (l) => l.item_id && Number(l.qty) > 0 && l.unit,
      );
      if (valid.length > 0) {
        const { error: insErr } = await supabase
          .from("customization_materials")
          .insert(
            valid.map((l) => ({
              customization_id: customizationId,
              item_id: l.item_id,
              qty: Number(l.qty),
              unit: l.unit,
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
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rondaCream">
            Descuento de inventario del extra
          </p>
          <p className="text-xs text-muted2">
            Al vender un producto con este extra se descuenta este material del
            inventario.
          </p>
        </div>
        <button
          type="button"
          onClick={addLink}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 px-3 text-xs font-bold text-rondaCream hover:bg-surface3"
        >
          Agregar material
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-xs text-muted2">Cargando…</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted2">
          Sin enlace: este extra no descuenta inventario al venderse.
        </p>
      ) : (
        <div className="space-y-3">
          {links.map((row) => {
            const item = inventoryItems.find((it) => it.id === row.item_id);
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
                      const it = inventoryItems.find(
                        (x) => x.id === e.target.value,
                      );
                      updateLink(row.id, {
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
                    onClick={() => deleteLink(row.id)}
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
                        updateLink(row.id, {
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
                        updateLink(row.id, { unit: e.target.value })
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-rondaAccent px-4 text-sm font-semibold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar inventario del extra"}
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
