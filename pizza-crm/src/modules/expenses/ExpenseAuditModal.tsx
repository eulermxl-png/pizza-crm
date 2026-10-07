"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button, Modal, cn } from "@/components/ui";

import type { AuditFinding, AuditResponse } from "./lib/auditTypes";
import type { ExpenseRow } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  range: { from: string; to: string };
  rows: ExpenseRow[];
  /** Se llama después de aplicar correcciones, para recargar la lista. */
  onChanged: () => void;
  /** Abre el formulario de edición normal del gasto. */
  onEdit: (row: ExpenseRow) => void;
};

const FIELD_LABEL = { category: "Categoría", description: "Descripción" } as const;

export default function ExpenseAuditModal({ open, onClose, range, rows, onChanged, onEdit }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(new Set());
    setDismissed(new Set());
    setChanged(false);
    void (async () => {
      try {
        const res = await fetch("/api/v1/ai/expenses-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(range),
        });
        const json = (await res.json()) as AuditResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "No se pudo revisar.");
        if (!cancelled) setResult(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo revisar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // range.from / range.to definen la revisión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, range.from, range.to]);

  function close() {
    if (changed) onChanged();
    onClose();
  }

  async function apply(f: AuditFinding) {
    if (!f.fix) return;
    setBusy(f.id);
    const { error: upErr } = await supabase
      .from("expenses")
      .update({ [f.fix.field]: f.fix.value })
      .in("id", f.expenseIds);
    setBusy(null);
    if (upErr) {
      setError(`No se pudo aplicar: ${upErr.message}`);
      return;
    }
    setApplied((s) => new Set(s).add(f.id));
    setChanged(true);
  }

  async function applyAll(list: AuditFinding[]) {
    for (const f of list) {
      if (!applied.has(f.id)) await apply(f);
    }
  }

  const visible = (result?.findings ?? []).filter((f) => !dismissed.has(f.id));
  const fixes = visible.filter((f) => f.severity === "fix");
  const reviews = visible.filter((f) => f.severity === "review");
  const pendingFixes = fixes.filter((f) => !applied.has(f.id));

  function card(f: AuditFinding) {
    const done = applied.has(f.id);
    const related = f.expenseIds.map((id) => byId.get(id)).filter((r): r is ExpenseRow => Boolean(r));
    return (
      <li
        key={f.id}
        className={cn("rounded-xl border border-line bg-surface2 p-3", done && "opacity-60")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-rondaCream">
              {f.title}
              {f.source === "ia" ? (
                <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted2">
                  IA
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-sm text-muted">{f.detail}</p>
            {f.fix ? (
              <p className="mt-2 text-sm">
                <span className="text-muted2">{FIELD_LABEL[f.fix.field]}: </span>
                {related[0] ? (
                  <span className="text-muted line-through">
                    {f.fix.field === "category" ? related[0].category : related[0].description}
                  </span>
                ) : null}{" "}
                → <span className="font-semibold" style={{ color: "var(--ok)" }}>{f.fix.value}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {f.fix ? (
            done ? (
              <span className="text-xs font-semibold" style={{ color: "var(--ok)" }}>✓ Corregido</span>
            ) : (
              <Button size="sm" variant="success" disabled={busy !== null} onClick={() => void apply(f)}>
                {busy === f.id ? "Aplicando…" : "Aplicar"}
              </Button>
            )
          ) : null}
          {!done
            ? related.map((r) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    close();
                    onEdit(r);
                  }}
                >
                  Editar{related.length > 1 ? ` (${r.date})` : ""}
                </Button>
              ))
            : null}
          {!done ? (
            <Button size="sm" variant="ghost" onClick={() => setDismissed((s) => new Set(s).add(f.id))}>
              Está bien así
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Revisión de gastos" className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <p className="-mt-2 mb-4 text-xs text-muted2">
        {range.from === range.to ? range.from : `${range.from} — ${range.to}`}
        {result ? ` · ${result.revisados} registros revisados` : ""}
      </p>

      {loading ? <p className="py-8 text-center text-muted2">Revisando gastos…</p> : null}
      {error ? (
        <div className="mb-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      {result && !loading ? (
        <div className="space-y-5">
          {result.ia !== "ok" ? (
            <p className="rounded-lg border border-line bg-surface2 p-2 text-xs text-muted">
              {result.ia === "sin_llave"
                ? "Solo se aplicaron las reglas automáticas: la IA no está configurada en el servidor."
                : `La IA no respondió (${result.iaError ?? "error"}); se muestran solo las reglas automáticas.`}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--ok)" }}>
              ✓ No se encontraron errores en este periodo.
            </p>
          ) : null}

          {fixes.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-rondaCream">Correcciones sugeridas ({fixes.length})</h4>
                {pendingFixes.length > 1 ? (
                  <Button size="sm" variant="success" disabled={busy !== null} onClick={() => void applyAll(pendingFixes)}>
                    Aplicar todas
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-2">{fixes.map(card)}</ul>
            </section>
          ) : null}

          {reviews.length > 0 ? (
            <section>
              <h4 className="mb-2 text-sm font-bold text-rondaCream">Para revisar ({reviews.length})</h4>
              <ul className="space-y-2">{reviews.map(card)}</ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={close}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
