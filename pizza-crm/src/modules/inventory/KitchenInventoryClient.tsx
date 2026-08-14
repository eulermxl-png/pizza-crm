"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { buildInventoryWhatsAppMessage } from "./lib/buildInventoryMessage";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_LEVELS,
  type InventoryItem,
  type InventoryLevel,
  type InventoryReport,
  type InventoryReportItem,
} from "./types";

type MarkState = {
  level: InventoryLevel | null;
  quantity_text: string;
};

type HistoryDetail = {
  report: InventoryReport;
  items: InventoryReportItem[];
};

function groupByCategory(items: InventoryItem[]) {
  const map = new Map<string, InventoryItem[]>();
  for (const it of items) {
    const cur = map.get(it.category) ?? [];
    cur.push(it);
    map.set(it.category, cur);
  }
  Array.from(map.values()).forEach((list) => {
    list.sort((a, b) => a.sort_order - b.sort_order);
  });
  const order = [...INVENTORY_CATEGORIES];
  const keys = Array.from(map.keys()).sort((a, b) => {
    const ia = order.indexOf(a as (typeof INVENTORY_CATEGORIES)[number]);
    const ib = order.indexOf(b as (typeof INVENTORY_CATEGORIES)[number]);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b, "es");
  });
  return keys.map((cat) => ({ category: cat, items: map.get(cat)! }));
}

export default function KitchenInventoryClient() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [marks, setMarks] = useState<Record<string, MarkState>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<InventoryReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(
    null,
  );

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [addBusy, setAddBusy] = useState(false);
  const [faltaByReport, setFaltaByReport] = useState<Record<string, number>>(
    {},
  );

  const loadItems = useCallback(async () => {
    setError(null);
    const { data, error: qErr } = await supabase
      .from("inventory_items")
      .select("id,name,category,sort_order,active")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (qErr) {
      setError(qErr.message);
      setItems([]);
    } else {
      setItems((data ?? []) as InventoryItem[]);
    }
    setLoading(false);
  }, [supabase]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data, error: qErr } = await supabase
      .from("inventory_reports")
      .select("id,created_at,created_by,notes")
      .order("created_at", { ascending: false })
      .limit(40);
    if (qErr) {
      setError(qErr.message);
      setHistory([]);
      setHistoryLoading(false);
      return;
    }
    const rows = (data ?? []) as InventoryReport[];
    const userIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]),
    );
    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id,name")
        .in("id", userIds);
      nameMap = new Map(
        (users ?? []).map((u) => [u.id as string, u.name as string]),
      );
    }
    setHistory(
      rows.map((r) => ({
        ...r,
        creator_name: r.created_by ? nameMap.get(r.created_by) ?? null : null,
      })),
    );
    setHistoryLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadItems();
    void loadHistory();
  }, [loadItems, loadHistory]);

  useEffect(() => {
    if (history.length === 0) {
      setFaltaByReport({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const ids = history.map((r) => r.id);
      const { data } = await supabase
        .from("inventory_report_items")
        .select("report_id, level")
        .in("report_id", ids)
        .in("level", ["poco", "agotado"]);
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const id of ids) next[id] = 0;
      for (const row of data ?? []) {
        const rid = row.report_id as string;
        next[rid] = (next[rid] ?? 0) + 1;
      }
      setFaltaByReport(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [history, supabase]);

  const grouped = useMemo(() => groupByCategory(items), [items]);

  const markedCount = useMemo(
    () => Object.values(marks).filter((m) => m.level).length,
    [marks],
  );

  function setLevel(itemId: string, level: InventoryLevel) {
    setMarks((prev) => {
      const cur = prev[itemId] ?? { level: null, quantity_text: "" };
      const nextLevel = cur.level === level ? null : level;
      return {
        ...prev,
        [itemId]: { ...cur, level: nextLevel },
      };
    });
  }

  function setQty(itemId: string, quantity_text: string) {
    setMarks((prev) => {
      const cur = prev[itemId] ?? { level: null, quantity_text: "" };
      return { ...prev, [itemId]: { ...cur, quantity_text } };
    });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  }

  async function saveReport() {
    const marked = items
      .map((it) => {
        const m = marks[it.id];
        if (!m?.level) return null;
        return {
          item: it,
          level: m.level,
          quantity_text: m.quantity_text.trim() || null,
        };
      })
      .filter(Boolean) as {
      item: InventoryItem;
      level: InventoryLevel;
      quantity_text: string | null;
    }[];

    if (marked.length === 0) {
      setError("Marca al menos un insumo antes de guardar.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: report, error: rErr } = await supabase
        .from("inventory_reports")
        .insert({
          created_by: user?.id ?? null,
          notes: notes.trim() || null,
        })
        .select("id,created_at,created_by,notes")
        .single();
      if (rErr || !report) throw new Error(rErr?.message ?? "Error al guardar");

      const rows = marked.map((m) => ({
        report_id: report.id,
        item_id: m.item.id,
        level: m.level,
        quantity_text: m.quantity_text,
      }));
      const { error: iErr } = await supabase
        .from("inventory_report_items")
        .insert(rows);
      if (iErr) throw new Error(iErr.message);

      const msg = buildInventoryWhatsAppMessage(
        marked.map((m) => ({
          name: m.item.name,
          level: m.level,
          quantity_text: m.quantity_text,
          sort_order: m.item.sort_order,
        })),
        notes,
      );
      setLastMessage(msg);
      setMarks({});
      setNotes("");
      setNotice("Reporte guardado.");
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(report: InventoryReport) {
    setError(null);
    const { data, error: qErr } = await supabase
      .from("inventory_report_items")
      .select(
        "id,report_id,item_id,level,quantity_text,inventory_items(name,category,sort_order)",
      )
      .eq("report_id", report.id);
    if (qErr) {
      setError(qErr.message);
      return;
    }
    const itemsMapped: InventoryReportItem[] = (data ?? []).map((row) => {
      const embed = row.inventory_items as
        | { name: string; category: string; sort_order: number }
        | { name: string; category: string; sort_order: number }[]
        | null;
      const meta = Array.isArray(embed) ? embed[0] : embed;
      return {
        id: row.id as string,
        report_id: row.report_id as string,
        item_id: row.item_id as string,
        level: row.level as InventoryLevel,
        quantity_text: (row.quantity_text as string | null) ?? null,
        item_name: meta?.name,
        item_category: meta?.category,
        item_sort_order: meta?.sort_order,
      };
    });
    setHistoryDetail({ report, items: itemsMapped });
  }

  async function confirmAddItem() {
    const name = addName.trim();
    if (!name) {
      setError("Escribe el nombre del insumo.");
      return;
    }
    setAddBusy(true);
    setError(null);
    try {
      const inCat = items.filter((i) => i.category === addCategory);
      const maxSort =
        inCat.length > 0
          ? Math.max(...inCat.map((i) => i.sort_order))
          : INVENTORY_CATEGORIES.indexOf(
              addCategory as (typeof INVENTORY_CATEGORIES)[number],
            ) *
              100 +
            100;
      const { error: iErr } = await supabase.from("inventory_items").insert({
        name,
        category: addCategory,
        sort_order: maxSort + 10,
        active: true,
      });
      if (iErr) throw new Error(iErr.message);
      setAddOpen(false);
      setAddName("");
      setAddCategory(INVENTORY_CATEGORIES[0]);
      await loadItems();
      setNotice("Insumo agregado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setAddBusy(false);
    }
  }

  const historyMessage = useMemo(() => {
    if (!historyDetail) return null;
    return buildInventoryWhatsAppMessage(
      historyDetail.items.map((i) => ({
        name: i.item_name ?? "Insumo",
        level: i.level,
        quantity_text: i.quantity_text,
        sort_order: i.item_sort_order,
      })),
      historyDetail.report.notes,
    );
  }, [historyDetail]);

  if (loading) {
    return (
      <p className="p-6 text-center text-xl text-zinc-500">
        Cargando inventario…
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-2 pb-8 pt-2 sm:px-4">
      {error ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-zinc-50">
              Checklist de insumos
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Marca el nivel de cada cosa. Solo se guardan los marcados (
              {markedCount} ahora).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="min-h-11 rounded-xl border border-zinc-600 bg-zinc-900 px-4 text-sm font-bold text-zinc-100 hover:bg-zinc-800"
          >
            + Agregar insumo
          </button>
        </div>

        {grouped.map(({ category, items: catItems }) => (
          <div
            key={category}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4"
          >
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
              {category}
            </h3>
            <ul className="space-y-4">
              {catItems.map((it) => {
                const m = marks[it.id] ?? { level: null, quantity_text: "" };
                return (
                  <li
                    key={it.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                  >
                    <p className="mb-2 text-lg font-bold text-zinc-50">
                      {it.name}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {INVENTORY_LEVELS.map((lv) => {
                        const active = m.level === lv.value;
                        return (
                          <button
                            key={lv.value}
                            type="button"
                            onClick={() => setLevel(it.id, lv.value)}
                            className={
                              active
                                ? "min-h-12 rounded-xl bg-rondaAccent px-2 text-sm font-bold text-rondaCream"
                                : "min-h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
                            }
                          >
                            {lv.emoji} {lv.label}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={m.quantity_text}
                      onChange={(e) => setQty(it.id, e.target.value)}
                      placeholder="cantidad (ej. 5%, 2 lt, 16 cajas)"
                      className="mt-2 h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-zinc-500">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Algo fuera de la lista…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </div>

        <button
          type="button"
          disabled={saving || markedCount === 0}
          onClick={() => void saveReport()}
          className="min-h-14 w-full rounded-2xl bg-emerald-700 text-xl font-black text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          {saving ? "Guardando…" : "Guardar reporte"}
        </button>
      </section>

      {lastMessage ? (
        <section className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-amber-100">
              Mensaje para WhatsApp
            </h3>
            <button
              type="button"
              onClick={() => void copyText(lastMessage)}
              className="min-h-10 rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 text-sm font-bold text-amber-100 hover:bg-amber-950/60"
            >
              {copied ? "¡Copiado!" : "Copiar mensaje"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-200">
            {lastMessage}
          </pre>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-lg font-bold text-zinc-50">Historial</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Reportes anteriores para comparar días.
        </p>
        {historyLoading ? (
          <p className="mt-4 text-zinc-500">Cargando…</p>
        ) : history.length === 0 ? (
          <p className="mt-4 text-zinc-500">Aún no hay reportes.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {history.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void openHistory(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left hover:bg-zinc-900"
                >
                  <div>
                    <p className="font-semibold text-zinc-100">
                      {new Date(r.created_at).toLocaleString("es-MX")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.creator_name ?? "—"} · En falta:{" "}
                      {faltaByReport[r.id] ?? "…"}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-zinc-400">Ver</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historyDetail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-zinc-50">
                  Reporte{" "}
                  {new Date(historyDetail.report.created_at).toLocaleString(
                    "es-MX",
                  )}
                </h3>
                <p className="text-sm text-zinc-500">
                  {historyDetail.report.creator_name ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryDetail(null)}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300"
              >
                Cerrar
              </button>
            </div>
            <ul className="mb-4 space-y-2 text-sm">
              {historyDetail.items
                .slice()
                .sort(
                  (a, b) =>
                    (a.item_sort_order ?? 0) - (b.item_sort_order ?? 0),
                )
                .map((i) => (
                  <li
                    key={i.id}
                    className="flex justify-between gap-2 border-b border-zinc-800 py-2"
                  >
                    <span className="text-zinc-200">
                      {i.item_name}
                      {i.quantity_text ? (
                        <span className="text-zinc-500">
                          {" "}
                          · {i.quantity_text}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold text-zinc-400">
                      {INVENTORY_LEVELS.find((l) => l.value === i.level)
                        ?.label ?? i.level}
                    </span>
                  </li>
                ))}
            </ul>
            {historyMessage ? (
              <>
                <button
                  type="button"
                  onClick={() => void copyText(historyMessage)}
                  className="mb-3 min-h-10 w-full rounded-lg border border-amber-700/60 bg-amber-950/40 text-sm font-bold text-amber-100"
                >
                  {copied ? "¡Copiado!" : "Copiar mensaje"}
                </button>
                <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-200">
                  {historyMessage}
                </pre>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
            <h3 className="text-xl font-bold text-zinc-50">Agregar insumo</h3>
            <label className="mt-4 mb-1 block text-xs text-zinc-500">
              Nombre
            </label>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="h-11 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-zinc-100"
            />
            <label className="mt-3 mb-1 block text-xs text-zinc-500">
              Categoría
            </label>
            <select
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              className="h-11 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-zinc-100"
            >
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={addBusy}
                onClick={() => setAddOpen(false)}
                className="h-11 flex-1 rounded-lg border border-zinc-600 font-semibold text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={addBusy}
                onClick={() => void confirmAddItem()}
                className="h-11 flex-1 rounded-lg bg-rondaAccent font-bold text-rondaCream"
              >
                {addBusy ? "…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
