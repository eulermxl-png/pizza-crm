"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Employee = { id: string; name: string; active: boolean };

export default function EmployeesManager() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nName, setNName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase
      .from("employees")
      .select("id,name,active")
      .order("name", { ascending: true });
    if (e) {
      setError(e.message);
      setRows([]);
    } else setRows((data ?? []) as Employee[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(id: string, patch: Partial<Employee>) {
    setBusy(id);
    setError(null);
    const { error: e } = await supabase.from("employees").update(patch).eq("id", id);
    if (e) setError(e.message);
    setBusy(null);
    void load();
  }

  async function del(emp: Employee) {
    if (!window.confirm(`¿Eliminar a "${emp.name}"?`)) return;
    setBusy(emp.id);
    setError(null);
    const { error: e } = await supabase.from("employees").delete().eq("id", emp.id);
    setBusy(null);
    if (e) {
      setError(`No se pudo eliminar a "${emp.name}".`);
      return;
    }
    void load();
  }

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    const name = nName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.from("employees").insert({ name });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setNName("");
    void load();
  }

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted">
        Trabajadores para la nómina. Al registrar un gasto de tipo Nómina,
        eliges al trabajador de esta lista.
      </p>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted2">
            Nombre del trabajador
          </label>
          <input
            value={nName}
            onChange={(e) => setNName(e.target.value)}
            className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-rondaCream"
            placeholder="Ej. Juan Pérez"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "+ Agregar"}
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted2">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted2">Aún no hay trabajadores.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[420px] text-left text-sm text-rondaCream">
            <thead className="border-b border-line bg-surface2 text-xs uppercase text-muted2">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.id} className="border-b border-line">
                  <td className="px-3 py-2">
                    <input
                      defaultValue={emp.name}
                      disabled={busy === emp.id}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== emp.name) void save(emp.id, { name: v });
                      }}
                      className="h-10 w-64 rounded-lg border border-line bg-surface3 px-2 text-rondaCream"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={busy === emp.id}
                      onClick={() => void del(emp)}
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
    </div>
  );
}
