"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import type { CustomizationRow } from "../types";

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
        className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 lg:flex-row lg:items-end"
      >
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-sm text-zinc-300">
            Nueva opción
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='Ej. "Queso extra"'
            className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
          />
        </div>
        <div className="w-full lg:w-40">
          <label className="mb-2 block text-sm text-zinc-300">
            Precio extra ($)
          </label>
          <input
            value={newExtraPrice}
            onChange={(e) => setNewExtraPrice(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-orange-500 px-5 font-semibold text-zinc-950 hover:bg-orange-400"
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
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center text-zinc-400">
          Todavía no hay opciones. El cajero las verá como casillas al agregar
          productos.
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-950/70 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Precio extra</th>
                <th className="px-4 py-3">Activa</th>
                <th className="px-4 py-3">Guardar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => (
                <CustomizationRowEditor
                  key={r.id}
                  row={r}
                  busy={busyId === r.id}
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
  onSave,
  onToggle,
}: {
  row: CustomizationRow;
  busy: boolean;
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
    <tr className="bg-zinc-950/25">
      <td className="px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={extraPrice}
          onChange={(e) => setExtraPrice(e.target.value)}
          inputMode="decimal"
          className="h-11 w-full max-w-[140px] rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-red-600"
        />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-3 font-semibold text-zinc-50 hover:bg-zinc-800 disabled:opacity-60"
        >
          {row.active ? "Desactivar" : "Activar"}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave(name, Math.max(0, Number(extraPrice) || 0))
          }
          className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-lg bg-zinc-900 px-3 font-semibold text-zinc-50 hover:bg-zinc-800 disabled:opacity-60"
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}
