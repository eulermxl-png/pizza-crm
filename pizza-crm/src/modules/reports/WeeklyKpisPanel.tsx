"use client";

/**
 * Bloque "Negocio · Cada semana" al inicio de Reportes:
 * ventas netas, pizzas por día, ticket promedio, food cost y margen por canal,
 * contra la semana anterior. Por defecto la última semana completa (lunes a domingo).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Card, IconCoins, IconPackage, IconPercent, KpiCard } from "@/components/ui";

import { SALES_CHANNELS } from "./lib/incomeStatement";
import {
  type WeekKpis,
  currentWeekMonday,
  lastCompleteWeekMonday,
  loadWeeklyKpis,
  weekRange,
  type WeeklyKpis,
} from "./lib/weeklyKpis";

/** Rango objetivo de food cost para pizzería (semáforo). */
const FOOD_COST_OK = 0.3;
const FOOD_COST_WARN = 0.35;

const money = (v: number) =>
  `$${v.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const money2 = (v: number) =>
  `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function addDaysYmd(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const x = new Date(y, m - 1, d + n, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Desglose de pizzas por día de la semana. El lunes (descanso) solo aparece si hubo venta. */
function PizzasPorDiaDetalle({ cur }: { cur: WeekKpis }) {
  const rows = DIAS.map((dia, i) => {
    const d = addDaysYmd(cur.range.from, i);
    return { dia, fecha: fmtDay(d), pizzas: cur.pizzasPorFecha[d] ?? 0, closed: i === 0 };
  }).filter((r) => !r.closed || r.pizzas > 0);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted2">Pizzas por día</p>
      <table className="w-full text-sm text-rondaCream">
        <tbody>
          {rows.map((r) => (
            <tr key={r.dia} className="border-t border-line/50">
              <td className="py-1.5">
                <span className="font-semibold">{r.dia}</span> <span className="text-xs text-muted2">{r.fecha}</span>
              </td>
              <td className="py-1.5 text-right font-bold tabular-nums">
                {r.pizzas ? Math.round(r.pizzas * 10) / 10 : <span className="font-normal text-muted2">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-bold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right tabular-nums">{Math.round(cur.pizzas)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function fmtDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Variación contra la semana anterior. `inverse`: bajar es bueno (food cost). */
function Delta({ cur, prev, kind = "pct", inverse = false }: { cur: number | null; prev: number | null; kind?: "pct" | "pts"; inverse?: boolean }) {
  if (cur == null || prev == null || (kind === "pct" && prev === 0)) {
    return <span className="text-muted2">sin comparación</span>;
  }
  const diff = kind === "pct" ? (cur - prev) / prev : (cur - prev) * 100;
  if (Math.abs(diff) < (kind === "pct" ? 0.005 : 0.05)) return <span className="text-muted2">= semana anterior</span>;
  const up = diff > 0;
  const good = inverse ? !up : up;
  const label = kind === "pct" ? `${(Math.abs(diff) * 100).toFixed(1)}%` : `${Math.abs(diff).toFixed(1)} pts`;
  return (
    <span style={{ color: good ? "var(--ok)" : "var(--danger)" }} className="font-semibold">
      {up ? "▲" : "▼"} {label} <span className="font-normal text-muted2">vs semana anterior</span>
    </span>
  );
}

export default function WeeklyKpisPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [offset, setOffset] = useState(0); // 0 = última semana completa
  const [data, setData] = useState<WeeklyKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pizzasHover, setPizzasHover] = useState(false);
  const [pizzasPinned, setPizzasPinned] = useState(false);

  const base = useMemo(() => lastCompleteWeekMonday(), []);
  const thisMonday = useMemo(() => currentWeekMonday(), []);
  const cur = useMemo(() => weekRange(base, offset), [base, offset]);
  const prev = useMemo(() => weekRange(base, offset - 1), [base, offset]);
  const isCurrentWeek = cur.from === weekRange(thisMonday).from;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadWeeklyKpis(supabase, cur, prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las métricas.");
    } finally {
      setLoading(false);
    }
  }, [supabase, cur, prev]);

  useEffect(() => {
    void load();
  }, [load]);

  const c = data?.cur;
  const p = data?.prev;
  const fcTone = c?.foodCostPct == null ? "brand" : c.foodCostPct <= FOOD_COST_OK ? "ok" : c.foodCostPct <= FOOD_COST_WARN ? "warn" : "danger";

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--brand)" }}>
            Negocio
          </p>
          <h3 className="text-lg font-bold text-rondaCream">Cada semana</h3>
          <p className="text-sm text-muted">
            {fmtDay(cur.from)} – {fmtDay(cur.to)}
            {isCurrentWeek ? " (semana en curso)" : ""} · comparado con {fmtDay(prev.from)} – {fmtDay(prev.to)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            disabled={loading}
            className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm font-semibold text-rondaCream hover:bg-surface3 disabled:opacity-50"
          >
            ‹ Anterior
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            disabled={loading || isCurrentWeek}
            className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm font-semibold text-rondaCream hover:bg-surface3 disabled:opacity-40"
          >
            Siguiente ›
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
      ) : null}
      {loading && !data ? <p className="py-6 text-center text-muted2">Calculando…</p> : null}

      {c && p ? (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            <KpiCard
              tone="brand"
              icon={<IconCoins size={20} />}
              label="Ventas netas"
              value={money(c.ventasNetas)}
              sub={
                <div className="space-y-0.5">
                  <Delta cur={c.ventasNetas} prev={p.ventasNetas} />
                  <p className="text-muted2">sin propinas · incluye plataformas y mayoreo</p>
                </div>
              }
            />
            <div
              className="relative cursor-pointer"
              onMouseEnter={() => setPizzasHover(true)}
              onMouseLeave={() => setPizzasHover(false)}
              onClick={() => setPizzasPinned((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setPizzasPinned((v) => !v);
                if (e.key === "Escape") setPizzasPinned(false);
              }}
              aria-expanded={pizzasHover || pizzasPinned}
            >
              <KpiCard
                tone="teal"
                icon={<IconPackage size={20} />}
                label="Pizzas por día"
                value={c.pizzasPorDia.toFixed(1)}
                sub={
                  <div className="space-y-0.5">
                    <Delta cur={c.pizzasPorDia} prev={p.pizzasPorDia} />
                    <p className="text-muted2">
                      {Math.round(c.pizzas)} pizzas en {c.diasAbiertos} día{c.diasAbiertos === 1 ? "" : "s"} abierto{c.diasAbiertos === 1 ? "" : "s"}
                    </p>
                  </div>
                }
              />
              {pizzasHover || pizzasPinned ? (
                <div
                  className="absolute left-0 right-0 top-full z-30 min-w-[260px] pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="rounded-xl border border-line bg-surface p-3 shadow-2xl">
                  <PizzasPorDiaDetalle cur={c} />
                  {pizzasPinned ? (
                    <button
                      type="button"
                      onClick={() => setPizzasPinned(false)}
                      className="mt-2 w-full rounded-lg border border-line py-1.5 text-xs font-semibold text-muted hover:bg-surface2"
                    >
                      Cerrar
                    </button>
                  ) : (
                    <p className="mt-2 text-center text-[10px] text-muted2">Clic para dejarlo abierto</p>
                  )}
                  </div>
                </div>
              ) : null}
            </div>
            <KpiCard
              tone="amber"
              icon={<IconCoins size={20} />}
              label="Ticket promedio"
              value={money2(c.ticketPromedio)}
              sub={
                <div className="space-y-0.5">
                  <Delta cur={c.ticketPromedio} prev={p.ticketPromedio} />
                  <p className="text-muted2">{c.ordenes} órdenes (restaurante + plataformas)</p>
                </div>
              }
            />
            <KpiCard
              tone={fcTone}
              valueTone={fcTone === "brand" ? undefined : fcTone}
              icon={<IconPercent size={20} />}
              label="Food cost"
              value={pct(c.foodCostPct)}
              sub={
                <div className="space-y-0.5">
                  <Delta cur={c.foodCostPct} prev={p.foodCostPct} kind="pts" inverse />
                  <p className="text-muted2">
                    {money(c.costoVenta)} de costo de venta · meta ≤ {FOOD_COST_OK * 100}%
                  </p>
                </div>
              }
            />
          </div>

          <Card className="mt-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted2">Margen por canal</p>
              <p className="text-xs text-muted2">(ventas − costo de insumos) / ventas</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {SALES_CHANNELS.map((ch) => {
                const k = c.canal[ch];
                const kp = p.canal[ch];
                return (
                  <div key={ch} className="rounded-xl border border-line bg-surface2 p-3">
                    <p className="text-sm font-semibold text-rondaCream">{ch}</p>
                    <p className="nums mt-1 text-2xl font-bold text-rondaCream">{pct(k.margen)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {money(k.ventas)} ventas · {money(k.costo)} insumos
                    </p>
                    <p className="mt-0.5 text-xs">
                      <Delta cur={k.margen} prev={kp.margen} kind="pts" />
                    </p>
                    {ch === "Plataformas" && k.ventas > 0 ? (
                      <p className="mt-1 text-[11px] text-muted2">Sin descontar la comisión de Uber/DiDi.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

        </div>
      ) : null}
    </section>
  );
}
