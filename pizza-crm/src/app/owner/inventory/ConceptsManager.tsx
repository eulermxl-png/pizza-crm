"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { ACCOUNTING_CATEGORIES } from "@/modules/inventory/types";

type Concept = {
  id: string;
  name: string;
  accounting_category: string;
  is_payroll: boolean;
  active: boolean;
  sort_order: number;
};

export default function ConceptsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nName, setNName] = useState("");
  const [nCat, setNCat] = useState<string>("Gasto de operación");
  const [nPay, setNPay] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase
      .from("expense_concepts")
      .select("id,name,accounting_category,is_payroll,active,sort_order")
      .order("sort_order", { ascending: true });
    if (e) {
      setError(e.message);
      setRows([]);
    } else setRows((data ?? []) as Concept[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(id: string, patch: Partial<Concept>) {
    setBusy(id);
    setError(null);
    const { error: e } = await supabase
      .from("expense_concepts")
      .update(patch)
      .eq("id", id);
    if (e) setError(e.message);
    setBusy(null);
    void load();
  }

  async function del(c: Concept) {
    if (!window.confirm(`¿Eliminar el concepto "${c.name}"?`)) return;
    setBusy(c.id);
    setError(null);
    const { error: e } = await supabase
      .from("expense_concepts")
      .delete()
      .eq("id", c.id);
    setBusy(null);
    if (e) {
      setError(`No se pudo eliminar "${c.name}".`);
      return;
    }
    void load();
  }

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    const name = nName.trim();
    if (!name) return;
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.from("expense_concepts").insert({
      name,
      accounting_category: nCat,
      is_payroll: nPay,
      sort_order: maxSort + 10,
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setShowAdd(false);
    setNName("");
    setNPay(false);
    void load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-400">
          Conceptos para registrar gastos (Luz, Renta, Nómina…). Cada uno lleva
          fija su categoría contable. Marca los de nómina para que al
          registrarlos pidan el trabajador.
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          + Agregar concepto
        </button>
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
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Categoría contable</th>
                <th className="px-3 py-2 text-center">Nómina</th>
                <th className="px-3 py-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-zinc-800/60">
                  <td className="px-3 py-2">
                    <input
                      defaultValue={c.name}
                      disabled={busy === c.id}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== c.name) void save(c.id, { name: v });
                      }}
                      className="h-10 w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={c.accounting_category}
                      disabled={busy === c.id}
                      onChange={(e) =>
                        void save(c.id, { accounting_category: e.target.value })
                      }
                      className="h-10 w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                    >
                      {ACCOUNTING_CATEGORIES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => void save(c.id, { is_payroll: !c.is_payroll })}
                      className={
                        c.is_payroll
                          ? "rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200"
                          : "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-400"
                      }
                    >
                      {c.is_payroll ? "Sí" : "No"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => void del(c)}
                      className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/60 disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/60"
            onClick={() => !saving && setShowAdd(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl sm:rounded-2xl">
            <h3 className="text-lg font-bold text-zinc-50">Nuevo concepto</h3>
            <form onSubmit={add} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Nombre</label>
                <input
                  required
                  value={nName}
                  onChange={(e) => setNName(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                  placeholder="Ej. Recibo de luz"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Categoría contable
                </label>
                <select
                  value={nCat}
                  onChange={(e) => setNCat(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100"
                >
                  {ACCOUNTING_CATEGORIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={nPay}
                  onChange={(e) => setNPay(e.target.checked)}
                />
                Es nómina (pedirá el trabajador al registrar)
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="h-11 flex-1 rounded-lg border border-zinc-700 font-semibold text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 flex-1 rounded-lg bg-rondaAccent font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
