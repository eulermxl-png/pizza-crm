"use client";

/**
 * Flujo de efectivo semanal (caja + banco como un solo dinero).
 * Semanas reales (lo cobrado y lo pagado) + proyección de 4 semanas:
 * promedio de las últimas 4 semanas completas + movimientos planeados que captura el equipo
 * (renta, nómina, préstamos…). Migración 0065.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { toLocalYmd } from "@/modules/expenses/lib/dateRange";

type Direction = "in" | "out";
type Recurrence = "none" | "weekly" | "monthly";

type WeeklyRow = { week: string; direction: Direction; concept: string; amount: number | string };
type Settings = {
  opening_date: string | null;
  opening_amount: number | string | null;
  card_fee_pct: number | string;
  platform_fee_pct: number | string;
};
type Item = {
  id: string;
  concept: string;
  direction: Direction;
  amount: number | string;
  date: string;
  recurrence: Recurrence;
  until: string | null;
  notes: string | null;
  active: boolean;
};

const PAST_WEEKS = 8;
const FUTURE_WEEKS = 4;
const AVG_WEEKS = 4;
/** Salidas que NO se promedian en la proyección: se capturan como movimientos planeados. */
const PLANNED_ONLY = new Set(["Renta", "Nómina"]);

const IN_ORDER = ["Efectivo", "Tarjeta (terminal)", "Plataformas", "Mayoreo"];
const CARD = "Tarjeta (terminal)";
const PLAT = "Plataformas";
const FEES = "Comisiones (terminal y plataformas)";

const money = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

/* ---------- Fechas ---------- */
function ymdToDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtWeek(ymd: string) {
  return ymdToDate(ymd).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Ocurrencias de un movimiento planeado dentro de [from, to] (YYYY-MM-DD). */
function occurrences(it: Item, from: string, to: string): string[] {
  const out: string[] = [];
  const end = it.until && it.until < to ? it.until : to;
  if (it.recurrence === "none") {
    if (it.date >= from && it.date <= end) out.push(it.date);
    return out;
  }
  const start = ymdToDate(it.date);
  if (it.recurrence === "weekly") {
    for (let d = start; toLocalYmd(d) <= end; d = addDays(d, 7)) {
      const y = toLocalYmd(d);
      if (y >= from) out.push(y);
    }
    return out;
  }
  // mensual: mismo día del mes (o el último día si el mes es más corto)
  const day = start.getDate();
  for (let i = 0; i < 60; i++) {
    const y0 = start.getFullYear();
    const m0 = start.getMonth() + i;
    const last = new Date(y0, m0 + 1, 0).getDate();
    const d = new Date(y0, m0, Math.min(day, last), 12);
    const y = toLocalYmd(d);
    if (y > end) break;
    if (y >= from) out.push(y);
  }
  return out;
}

const RECURRENCE_LABEL: Record<Recurrence, string> = { none: "Una vez", weekly: "Cada semana", monthly: "Cada mes" };

export default function CashflowClient() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<WeeklyRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Formularios
  const [sDate, setSDate] = useState("");
  const [sAmount, setSAmount] = useState("");
  const [sCard, setSCard] = useState("");
  const [sPlat, setSPlat] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [fConcept, setFConcept] = useState("");
  const [fDir, setFDir] = useState<Direction>("out");
  const [fAmount, setFAmount] = useState("");
  const [fDate, setFDate] = useState(() => toLocalYmd(new Date()));
  const [fRec, setFRec] = useState<Recurrence>("monthly");
  const [fUntil, setFUntil] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const thisMonday = useMemo(() => mondayOf(today), [today]);
  const weeks = useMemo(() => {
    const list: { start: string; end: string; kind: "real" | "current" | "proj" }[] = [];
    for (let i = -PAST_WEEKS; i <= FUTURE_WEEKS; i++) {
      const s = addDays(thisMonday, i * 7);
      list.push({
        start: toLocalYmd(s),
        end: toLocalYmd(addDays(s, 6)),
        kind: i < 0 ? "real" : i === 0 ? "current" : "proj",
      });
    }
    return list;
  }, [thisMonday]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = weeks[0].start;
    const to = toLocalYmd(addDays(thisMonday, 6));
    const [w, s, it] = await Promise.all([
      supabase.rpc("cashflow_weekly", { p_from: from, p_to: to }),
      supabase.from("cashflow_settings").select("opening_date, opening_amount, card_fee_pct, platform_fee_pct").eq("id", 1).maybeSingle(),
      supabase.from("cashflow_items").select("id, concept, direction, amount, date, recurrence, until, notes, active").order("date", { ascending: true }),
    ]);
    setLoading(false);
    const err = w.error ?? s.error ?? it.error;
    if (err) {
      setError(err.message);
      return;
    }
    setRows((w.data ?? []) as WeeklyRow[]);
    const st = (s.data ?? { opening_date: null, opening_amount: null, card_fee_pct: 0, platform_fee_pct: 0 }) as Settings;
    setSettings(st);
    setSDate(st.opening_date ?? "");
    setSAmount(st.opening_amount == null ? "" : String(Number(st.opening_amount)));
    setSCard(String(Number(st.card_fee_pct) || 0));
    setSPlat(String(Number(st.platform_fee_pct) || 0));
    setItems((it.data ?? []) as Item[]);
  }, [supabase, weeks, thisMonday]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- Cálculo ---------- */
  const table = useMemo(() => {
    const cardFee = (Number(settings?.card_fee_pct) || 0) / 100;
    const platFee = (Number(settings?.platform_fee_pct) || 0) / 100;

    // Reales por semana/concepto
    const real = new Map<string, Map<string, number>>(); // week -> "dir|concept" -> monto
    for (const r of rows) {
      const m = real.get(r.week) ?? new Map<string, number>();
      const k = `${r.direction}|${r.concept}`;
      m.set(k, (m.get(k) ?? 0) + Number(r.amount));
      real.set(r.week, m);
    }
    // Comisiones como salida explícita
    for (const [, m] of Array.from(real.entries())) {
      const fee = (m.get(`in|${CARD}`) ?? 0) * cardFee + (m.get(`in|${PLAT}`) ?? 0) * platFee;
      if (fee > 0) m.set(`out|${FEES}`, fee);
    }

    // Promedio de las últimas semanas completas (para proyectar)
    const lastComplete = weeks.filter((w) => w.kind === "real").slice(-AVG_WEEKS);
    const avg = new Map<string, number>();
    for (const w of lastComplete) {
      const m = real.get(w.start);
      if (!m) continue;
      for (const [k, v] of Array.from(m.entries())) {
        const concept = k.split("|")[1];
        if (k.startsWith("out|") && PLANNED_ONLY.has(concept)) continue;
        avg.set(k, (avg.get(k) ?? 0) + v / lastComplete.length);
      }
    }

    // Planeados por semana (solo semanas futuras)
    const planned = new Map<string, { in: { c: string; a: number }[]; out: { c: string; a: number }[] }>();
    for (const w of weeks.filter((x) => x.kind === "proj")) {
      const p = { in: [] as { c: string; a: number }[], out: [] as { c: string; a: number }[] };
      for (const it of items.filter((x) => x.active)) {
        for (const _d of occurrences(it, w.start, w.end)) p[it.direction].push({ c: it.concept, a: Number(it.amount) });
      }
      planned.set(w.start, p);
    }

    // Conceptos (filas)
    const inSet = new Set<string>(IN_ORDER);
    const outSet = new Set<string>();
    for (const m of Array.from(real.values())) for (const k of Array.from(m.keys())) {
      const [d, c] = k.split("|");
      (d === "in" ? inSet : outSet).add(c);
    }
    const outOrder = ["Compras de insumos", "Insumos (gasto directo)", "Nómina", "Renta", "Servicios", "Mantenimiento", "Gasto de operación", "Propinas al equipo", FEES, "Otros"];
    const outRows = [...outOrder.filter((c) => outSet.has(c)), ...Array.from(outSet).filter((c) => !outOrder.includes(c)).sort()];
    const inRows = [...IN_ORDER, ...Array.from(inSet).filter((c) => !IN_ORDER.includes(c)).sort()];

    const opening = settings?.opening_date && settings.opening_amount != null ? { date: settings.opening_date, amount: Number(settings.opening_amount) } : null;
    const openingWeek = opening ? toLocalYmd(mondayOf(ymdToDate(opening.date))) : null;

    let saldo: number | null = null;
    const cols = weeks.map((w) => {
      const m = real.get(w.start) ?? new Map<string, number>();
      const isProj = w.kind === "proj";
      const val = (k: string) => (isProj ? avg.get(k) ?? 0 : m.get(k) ?? 0);
      const inVals = Object.fromEntries(inRows.map((c) => [c, val(`in|${c}`)]));
      const outVals = Object.fromEntries(outRows.map((c) => [c, val(`out|${c}`)]));
      const p = planned.get(w.start);
      const plannedIn = p?.in.reduce((s, x) => s + x.a, 0) ?? 0;
      const plannedOut = p?.out.reduce((s, x) => s + x.a, 0) ?? 0;
      const totalIn = Object.values(inVals).reduce((s, v) => s + v, 0) + plannedIn;
      const totalOut = Object.values(outVals).reduce((s, v) => s + v, 0) + plannedOut;
      const neto = totalIn - totalOut;
      if (openingWeek && w.start >= openingWeek) {
        saldo = (saldo ?? opening!.amount) + neto;
      }
      return { ...w, inVals, outVals, planned: p, plannedIn, plannedOut, totalIn, totalOut, neto, saldo: saldo as number | null };
    });

    const firstNegative = cols.find((c) => c.saldo != null && c.saldo < 0);
    return { cols, inRows, outRows, opening, firstNegative };
  }, [rows, settings, items, weeks]);

  /* ---------- Acciones ---------- */
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    const { error: upErr } = await supabase.from("cashflow_settings").upsert({
      id: 1,
      opening_date: sDate || null,
      opening_amount: sAmount.trim() === "" ? null : Number(sAmount),
      card_fee_pct: Number(sCard) || 0,
      platform_fee_pct: Number(sPlat) || 0,
      updated_at: new Date().toISOString(),
    });
    setSavingSettings(false);
    if (upErr) return setError(upErr.message);
    setOk("Configuración guardada.");
    void load();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(fAmount);
    if (!fConcept.trim() || !(amount > 0) || !fDate) return setError("Escribe concepto, monto y fecha.");
    setSavingItem(true);
    setError(null);
    const { error: insErr } = await supabase.from("cashflow_items").insert({
      concept: fConcept.trim(),
      direction: fDir,
      amount,
      date: fDate,
      recurrence: fRec,
      until: fRec !== "none" && fUntil ? fUntil : null,
    });
    setSavingItem(false);
    if (insErr) return setError(insErr.message);
    setFConcept("");
    setFAmount("");
    setFUntil("");
    setOk("Movimiento agregado a la proyección.");
    void load();
  }

  async function removeItem(it: Item) {
    setBusyId(it.id);
    const { error: delErr } = await supabase.from("cashflow_items").delete().eq("id", it.id);
    setBusyId(null);
    if (delErr) return setError(delErr.message);
    void load();
  }

  async function toggleItem(it: Item) {
    setBusyId(it.id);
    const { error: upErr } = await supabase.from("cashflow_items").update({ active: !it.active }).eq("id", it.id);
    setBusyId(null);
    if (upErr) return setError(upErr.message);
    void load();
  }

  const inputCls = "h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-sm text-rondaCream";
  const cellCls = "whitespace-nowrap px-3 py-1.5 text-right tabular-nums";

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">{error}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-sm text-emerald-200">{ok}</div> : null}

      {table.firstNegative ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          ⚠ La semana del {fmtWeek(table.firstNegative.start)} el saldo quedaría en{" "}
          <b>{money(table.firstNegative.saldo ?? 0)}</b>. Revisa los pagos de esa semana o adelanta cobros.
        </div>
      ) : null}

      {/* Tabla semanal */}
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-rondaCream">Semana a semana</h3>
            <p className="text-xs text-muted2">
              Reales: lo cobrado y lo pagado. <span className="text-sky-300">Proyección</span>: promedio de las últimas{" "}
              {AVG_WEEKS} semanas + movimientos planeados (renta y nómina solo se proyectan si están planeados).
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Cargando…" : "Actualizar"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm text-rondaCream">
            <thead>
              <tr className="border-b border-line text-xs text-muted2">
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left">Concepto</th>
                {table.cols.map((c) => (
                  <th key={c.start} className={`px-3 py-2 text-right ${c.kind === "proj" ? "text-sky-300" : ""}`}>
                    {fmtWeek(c.start)}
                    <span className="block text-[10px] font-normal">
                      {c.kind === "current" ? "en curso" : c.kind === "proj" ? "proyección" : "real"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={table.cols.length + 1} className="px-3 pt-3 text-xs font-bold uppercase text-emerald-300">Entradas</td></tr>
              {table.inRows.map((r) => (
                <tr key={`in-${r}`} className="border-b border-line/40">
                  <td className="sticky left-0 bg-surface px-3 py-1.5 text-muted">{r}</td>
                  {table.cols.map((c) => (
                    <td key={c.start} className={`${cellCls} ${c.kind === "proj" ? "text-sky-200/80" : ""}`}>
                      {c.inVals[r] ? money(c.inVals[r]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b border-line/40">
                <td className="sticky left-0 bg-surface px-3 py-1.5 text-muted">Planeado (entradas)</td>
                {table.cols.map((c) => (
                  <td key={c.start} className={cellCls} title={c.planned?.in.map((x) => `${x.c}: ${money(x.a)}`).join("\n")}>
                    {c.plannedIn ? money(c.plannedIn) : "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-line font-semibold">
                <td className="sticky left-0 bg-surface px-3 py-1.5">Total entradas</td>
                {table.cols.map((c) => <td key={c.start} className={cellCls}>{money(c.totalIn)}</td>)}
              </tr>

              <tr><td colSpan={table.cols.length + 1} className="px-3 pt-4 text-xs font-bold uppercase text-red-300">Salidas</td></tr>
              {table.outRows.map((r) => (
                <tr key={`out-${r}`} className="border-b border-line/40">
                  <td className="sticky left-0 bg-surface px-3 py-1.5 text-muted">{r}</td>
                  {table.cols.map((c) => (
                    <td key={c.start} className={`${cellCls} ${c.kind === "proj" ? "text-sky-200/80" : ""}`}>
                      {c.outVals[r] ? money(c.outVals[r]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b border-line/40">
                <td className="sticky left-0 bg-surface px-3 py-1.5 text-muted">Planeado (salidas)</td>
                {table.cols.map((c) => (
                  <td key={c.start} className={cellCls} title={c.planned?.out.map((x) => `${x.c}: ${money(x.a)}`).join("\n")}>
                    {c.plannedOut ? money(c.plannedOut) : "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-line font-semibold">
                <td className="sticky left-0 bg-surface px-3 py-1.5">Total salidas</td>
                {table.cols.map((c) => <td key={c.start} className={cellCls}>{money(c.totalOut)}</td>)}
              </tr>

              <tr className="border-b border-line text-base font-bold">
                <td className="sticky left-0 bg-surface px-3 py-2">Flujo neto</td>
                {table.cols.map((c) => (
                  <td key={c.start} className={cellCls} style={{ color: c.neto >= 0 ? "var(--ok)" : "var(--danger)" }}>
                    {money(c.neto)}
                  </td>
                ))}
              </tr>
              <tr className="text-base font-bold">
                <td className="sticky left-0 bg-surface px-3 py-2">Saldo (caja + banco)</td>
                {table.cols.map((c) => (
                  <td key={c.start} className={cellCls} style={c.saldo != null && c.saldo < 0 ? { color: "var(--danger)" } : undefined}>
                    {c.saldo == null ? "—" : money(c.saldo)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {!table.opening ? (
          <p className="mt-3 text-xs text-muted2">
            Para ver el saldo, captura abajo cuánto dinero había (caja + banco) en una fecha. De preferencia un lunes.
          </p>
        ) : null}
      </Card>

      {/* Movimientos planeados */}
      <Card>
        <h3 className="text-lg font-bold text-rondaCream">Pagos y cobros que vienen</h3>
        <p className="mt-1 text-xs text-muted2">
          Lo que ya se sabe que va a salir o entrar: renta, nómina, préstamos, pagos a proveedores, aportaciones de socios…
          Se suman a la proyección.
        </p>
        <form onSubmit={addItem} className="mt-4 grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted2">Concepto</label>
            <input value={fConcept} onChange={(e) => setFConcept(e.target.value)} placeholder="Ej. Renta" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Tipo</label>
            <select value={fDir} onChange={(e) => setFDir(e.target.value as Direction)} className={inputCls}>
              <option value="out">Sale</option>
              <option value="in">Entra</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Monto $</label>
            <input type="number" min={0} step="0.01" inputMode="decimal" value={fAmount} onChange={(e) => setFAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Fecha</label>
            <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={`input-date-dark ${inputCls}`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Se repite</label>
            <select value={fRec} onChange={(e) => setFRec(e.target.value as Recurrence)} className={inputCls}>
              <option value="none">Una vez</option>
              <option value="weekly">Cada semana</option>
              <option value="monthly">Cada mes</option>
            </select>
          </div>
          {fRec !== "none" ? (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted2">Hasta (opcional)</label>
              <input type="date" value={fUntil} onChange={(e) => setFUntil(e.target.value)} className={`input-date-dark ${inputCls}`} />
            </div>
          ) : null}
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={savingItem}>
              {savingItem ? "Guardando…" : "＋ Agregar"}
            </Button>
          </div>
        </form>

        {items.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm text-rondaCream">
              <thead className="border-b border-line text-xs text-muted2">
                <tr>
                  <th className="px-3 py-2 text-left">Concepto</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-left">Cuándo</th>
                  <th className="px-3 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <Fragment key={it.id}>
                    <tr className={`border-b border-line/40 ${it.active ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2">
                        <span className={it.direction === "in" ? "text-emerald-300" : "text-red-300"}>
                          {it.direction === "in" ? "▲ " : "▼ "}
                        </span>
                        {it.concept}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(Number(it.amount))}</td>
                      <td className="px-3 py-2 text-muted">
                        {RECURRENCE_LABEL[it.recurrence]} · desde {fmtWeek(it.date)}
                        {it.until ? ` hasta ${fmtWeek(it.until)}` : ""}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center gap-3">
                          <button type="button" disabled={busyId !== null} onClick={() => void toggleItem(it)} className="text-xs text-muted hover:underline">
                            {it.active ? "Pausar" : "Activar"}
                          </button>
                          <button type="button" disabled={busyId !== null} onClick={() => void removeItem(it)} className="text-xs text-red-400 hover:underline">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {/* Configuración */}
      <Card>
        <h3 className="text-lg font-bold text-rondaCream">Saldo inicial y comisiones</h3>
        <form onSubmit={saveSettings} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted2">Fecha del saldo</label>
            <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} className={`input-date-dark ${inputCls}`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Caja + banco ese día $</label>
            <input type="number" step="0.01" inputMode="decimal" value={sAmount} onChange={(e) => setSAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Comisión terminal %</label>
            <input type="number" min={0} step="0.01" inputMode="decimal" value={sCard} onChange={(e) => setSCard(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted2">Comisión Uber/DiDi %</label>
            <input type="number" min={0} step="0.01" inputMode="decimal" value={sPlat} onChange={(e) => setSPlat(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={savingSettings}>
              {savingSettings ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted2">
          No cuentan los retiros y abonos de caja: son movimientos internos; los pagos reales salen de Compras y Gastos.
          Si un pago (como la nómina) no está capturado en Compras y Gastos, no aparece aquí.
        </p>
      </Card>
    </div>
  );
}
