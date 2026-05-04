"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { sizeChoiceLabelEs } from "@/modules/menu/constants";

import { splitPaymentAcrossOrders } from "../lib/splitPaymentAcrossOrders";
import type { TableRow, TableStatus, UnpaidOrderRow } from "../types";

import {
  mixedAmountsMatchTotal,
  parseMoneyInput,
} from "@/modules/orders/lib/cartMath";
import type { OrderPaymentMethod } from "@/modules/orders/types";

const STATUS_BG: Record<TableStatus, string> = {
  free: "#22c55e",
  occupied: "#ef4444",
  waiting_payment: "#f59e0b",
};

function formatElapsed(openedAt: string | null, nowMs: number): string {
  if (!openedAt) return "—";
  const start = new Date(openedAt).getTime();
  const sec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function parseCustomizations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export default function CashierTablesScreen() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const onlineStatus = useOnlineStatus();
  const isOffline = onlineStatus === "offline";

  const [tables, setTables] = useState<TableRow[]>([]);
  const [runningByTable, setRunningByTable] = useState<Record<string, number>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [cuentaTable, setCuentaTable] = useState<TableRow | null>(null);
  const [cuentaOrders, setCuentaOrders] = useState<UnpaidOrderRow[]>([]);
  const [cuentaLoading, setCuentaLoading] = useState(false);

  const [cobrarTable, setCobrarTable] = useState<TableRow | null>(null);
  const [cobrarOrders, setCobrarOrders] = useState<UnpaidOrderRow[]>([]);
  const [cobrarLoading, setCobrarLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<OrderPaymentMethod>("cash");
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");
  const [cobrarBusy, setCobrarBusy] = useState(false);

  const [cancelMesaTarget, setCancelMesaTarget] = useState<TableRow | null>(
    null,
  );
  const [cancelMesaBusy, setCancelMesaBusy] = useState(false);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<string | null>(
    null,
  );
  const [deleteOrderBusy, setDeleteOrderBusy] = useState(false);

  const [openMesaTarget, setOpenMesaTarget] = useState<TableRow | null>(null);
  const [openMesaName, setOpenMesaName] = useState("");
  const [openMesaBusy, setOpenMesaBusy] = useState(false);

  const [productNames, setProductNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const loadTables = useCallback(async () => {
    if (isOffline) {
      setError("Las mesas requieren conexión.");
      setTables([]);
      setRunningByTable({});
      setLoading(false);
      return;
    }
    setError(null);
    const { data: tRows, error: tErr } = await supabase
      .from("tables")
      .select("id,number,name,status,current_order_id,opened_at,customer_name")
      .order("number", { ascending: true });

    if (tErr) {
      setError(tErr.message);
      setTables([]);
      setLoading(false);
      return;
    }

    const list = (tRows ?? []) as TableRow[];
    setTables(list);

    const ids = list.map((t) => t.id);
    if (ids.length === 0) {
      setRunningByTable({});
      setLoading(false);
      return;
    }

    const { data: oRows, error: oErr } = await supabase
      .from("orders")
      .select("id,table_id,total")
      .in("table_id", ids)
      .is("payment_method", null);

    if (oErr) {
      setError(oErr.message);
      setRunningByTable({});
    } else {
      const sums: Record<string, number> = {};
      for (const id of ids) sums[id] = 0;
      for (const r of oRows ?? []) {
        const tid = r.table_id as string;
        const tot = Number(r.total) || 0;
        if (tid && sums[tid] !== undefined) sums[tid] += tot;
      }
      setRunningByTable(sums);
    }
    setLoading(false);
  }, [supabase, isOffline]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (isOffline) return;
    const ch = supabase
      .channel("tables-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tables" },
        () => {
          void loadTables();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void loadTables();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, loadTables, isOffline]);

  const barra = useMemo(
    () => tables.find((t) => t.number === 0) ?? null,
    [tables],
  );
  const mesas = useMemo(
    () => tables.filter((t) => t.number > 0).sort((a, b) => a.number - b.number),
    [tables],
  );
  const mesasLeft = useMemo(() => mesas.filter((t) => t.number <= 3), [mesas]);
  const mesasRight = useMemo(() => mesas.filter((t) => t.number > 3), [mesas]);

  /** Mesa sigue en `free` hasta el primer envío a cocina (ver CashierOrderScreen). */
  function promptOpenMesa(table: TableRow) {
    if (isOffline) return;
    const existing = table.customer_name?.trim() ?? "";
    setOpenMesaName(existing);
    setOpenMesaTarget(table);
  }

  async function confirmAbrirMesa() {
    if (!openMesaTarget || isOffline) return;
    setOpenMesaBusy(true);
    setError(null);
    try {
      const label = openMesaName.trim() || null;
      const { data, error: uErr } = await supabase
        .from("tables")
        .update({ customer_name: label })
        .eq("id", openMesaTarget.id)
        .eq("status", "free")
        .select("id");

      if (uErr) throw new Error(uErr.message);
      if (!data?.length) {
        setError("La mesa ya no está libre. Actualiza e intenta de nuevo.");
        setOpenMesaTarget(null);
        void loadTables();
        return;
      }

      router.push(`/cashier/order?tableId=${openMesaTarget.id}`);
      setOpenMesaTarget(null);
      setOpenMesaName("");
      void loadTables();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el nombre.",
      );
    } finally {
      setOpenMesaBusy(false);
    }
  }

  async function setWaitingPayment(table: TableRow) {
    if (isOffline) return;
    setBusyId(table.id);
    setError(null);
    const { error: uErr } = await supabase
      .from("tables")
      .update({ status: "waiting_payment" })
      .eq("id", table.id)
      .eq("status", "occupied");

    if (uErr) setError(uErr.message);
    setBusyId(null);
    void loadTables();
  }

  async function loadUnpaidOrders(tableId: string) {
    const { data, error: qErr } = await supabase
      .from("orders")
      .select(
        `
        id,
        created_at,
        total,
        order_items (
          id,
          product_id,
          quantity,
          unit_price,
          size,
          customizations
        )
      `,
      )
      .eq("table_id", tableId)
      .is("payment_method", null)
      .order("created_at", { ascending: true });

    if (qErr) throw new Error(qErr.message);
    const rows = (data ?? []) as UnpaidOrderRow[];

    const pids = new Set<string>();
    for (const o of rows) {
      for (const it of o.order_items ?? []) pids.add(it.product_id);
    }
    if (pids.size > 0) {
      const { data: prods, error: pErr } = await supabase
        .from("products")
        .select("id,name")
        .in("id", Array.from(pids));
      if (!pErr && prods) {
        const m: Record<string, string> = {};
        for (const p of prods as { id: string; name: string }[]) {
          m[p.id] = p.name;
        }
        setProductNames(m);
      }
    } else {
      setProductNames({});
    }
    return rows;
  }

  async function openVerCuenta(table: TableRow) {
    if (table.number === 0) return;
    setCuentaTable(table);
    setCuentaLoading(true);
    setCuentaOrders([]);
    try {
      const rows = await loadUnpaidOrders(table.id);
      setCuentaOrders(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la cuenta");
    } finally {
      setCuentaLoading(false);
    }
  }

  async function openCobrarMesa(table: TableRow) {
    if (table.number === 0) return;
    setCobrarTable(table);
    setPaymentMethod("cash");
    setMixedCash("");
    setMixedCard("");
    setCobrarLoading(true);
    setCobrarOrders([]);
    try {
      const rows = await loadUnpaidOrders(table.id);
      setCobrarOrders(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pedidos");
      setCobrarTable(null);
    } finally {
      setCobrarLoading(false);
    }
  }

  const cobrarGrandTotal = useMemo(
    () => cobrarOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    [cobrarOrders],
  );

  async function confirmCobrarMesa() {
    if (!cobrarTable || cobrarOrders.length === 0) return;
    const totals = cobrarOrders.map((o) => Number(o.total) || 0);
    const grand = totals.reduce((a, b) => a + b, 0);
    if (grand <= 0) return;

    let cashAmt = 0;
    let cardAmt = 0;
    if (paymentMethod === "cash") {
      cashAmt = grand;
    } else if (paymentMethod === "card") {
      cardAmt = grand;
    } else {
      cashAmt = parseMoneyInput(mixedCash);
      cardAmt = parseMoneyInput(mixedCard);
      if (!mixedAmountsMatchTotal(cashAmt, cardAmt, grand)) {
        setError("Los montos mixtos deben coincidir con el total de la mesa.");
        return;
      }
    }

    const { cash: cashSplit, card: cardSplit } = splitPaymentAcrossOrders(
      totals,
      cashAmt,
      cardAmt,
    );

    setCobrarBusy(true);
    setError(null);
    try {
      for (let i = 0; i < cobrarOrders.length; i++) {
        const o = cobrarOrders[i];
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            payment_method: paymentMethod,
            cash_amount: cashSplit[i],
            card_amount: cardSplit[i],
            status: "delivered",
          })
          .eq("id", o.id);
        if (uErr) throw new Error(uErr.message);
      }

      const { error: tErr } = await supabase
        .from("tables")
        .update({
          status: "free",
          opened_at: null,
          current_order_id: null,
          customer_name: null,
        })
        .eq("id", cobrarTable.id);

      if (tErr) throw new Error(tErr.message);

      setCobrarTable(null);
      setCobrarOrders([]);
      void loadTables();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar la mesa");
    } finally {
      setCobrarBusy(false);
    }
  }

  async function confirmCancelMesa() {
    if (!cancelMesaTarget || isOffline) return;
    const tid = cancelMesaTarget.id;
    setCancelMesaBusy(true);
    setBusyId(tid);
    setError(null);
    try {
      const { error: dErr } = await supabase
        .from("orders")
        .delete()
        .eq("table_id", tid)
        .is("payment_method", null);
      if (dErr) throw new Error(dErr.message);

      const { error: uErr } = await supabase
        .from("tables")
        .update({
          status: "free",
          opened_at: null,
          current_order_id: null,
          customer_name: null,
        })
        .eq("id", tid);
      if (uErr) throw new Error(uErr.message);

      setCancelMesaTarget(null);
      if (cuentaTable?.id === tid) {
        setCuentaTable(null);
        setCuentaOrders([]);
      }
      if (cobrarTable?.id === tid) {
        setCobrarTable(null);
        setCobrarOrders([]);
      }
      void loadTables();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cancelar la mesa.",
      );
    } finally {
      setCancelMesaBusy(false);
      setBusyId(null);
    }
  }

  async function confirmDeleteSingleOrder() {
    if (!deleteOrderTarget || !cuentaTable || isOffline) return;
    const oid = deleteOrderTarget;
    const tid = cuentaTable.id;
    setDeleteOrderBusy(true);
    setError(null);
    try {
      const { error: dErr } = await supabase
        .from("orders")
        .delete()
        .eq("id", oid)
        .eq("table_id", tid)
        .is("payment_method", null);
      if (dErr) throw new Error(dErr.message);

      const { data: remaining, error: cErr } = await supabase
        .from("orders")
        .select("id")
        .eq("table_id", tid)
        .is("payment_method", null);
      if (cErr) throw new Error(cErr.message);

      if (!remaining?.length) {
        const { error: tErr } = await supabase
          .from("tables")
          .update({
            status: "free",
            opened_at: null,
            current_order_id: null,
            customer_name: null,
          })
          .eq("id", tid);
        if (tErr) throw new Error(tErr.message);
      }

      setDeleteOrderTarget(null);
      const rows = await loadUnpaidOrders(tid);
      setCuentaOrders(rows);
      void loadTables();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar el pedido.",
      );
    } finally {
      setDeleteOrderBusy(false);
    }
  }

  function tableTile(table: TableRow) {
    const isBar = table.number === 0;
    const running = runningByTable[table.id] ?? 0;
    const busy = busyId === table.id;

    return (
      <div
        key={table.id}
        className="flex flex-col gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/80 p-4 shadow-lg"
        style={{ borderTopWidth: 4, borderTopColor: STATUS_BG[table.status] }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-black text-zinc-50">{table.name}</p>
            <p className="text-xs font-semibold uppercase text-zinc-500">
              {table.status === "free"
                ? "Libre"
                : table.status === "occupied"
                  ? "Ocupada"
                  : "Esperando pago"}
            </p>
            {!isBar && table.customer_name?.trim() ? (
              <p className="mt-1 truncate text-sm font-semibold text-amber-100/95">
                {table.customer_name.trim()}
              </p>
            ) : null}
          </div>
          {!isBar ? (
            <p className="text-right text-sm font-bold tabular-nums text-rondaCream">
              ${running.toFixed(2)}
            </p>
          ) : null}
        </div>

        {!isBar && table.status !== "free" ? (
          <p className="text-xs text-zinc-400">
            Tiempo:{" "}
            <span className="font-mono text-zinc-200">
              {formatElapsed(table.opened_at, nowMs)}
            </span>
          </p>
        ) : null}

        <div className="mt-1 flex flex-col gap-2">
          {isBar ? (
            <button
              type="button"
              disabled={busy || isOffline}
              onClick={() => router.push("/cashier/order?barra=1")}
              className="min-h-11 rounded-lg bg-rondaAccent px-3 py-2 text-sm font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
            >
              Orden rápida (Barra)
            </button>
          ) : (
            <>
              {table.status === "free" ? (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => promptOpenMesa(table)}
                  className="min-h-11 rounded-lg bg-rondaAccent px-3 py-2 text-sm font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
                >
                  Abrir mesa
                </button>
              ) : (
                <>
                  <Link
                    href={`/cashier/order?tableId=${table.id}`}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-center text-sm font-bold text-zinc-100 hover:bg-zinc-700"
                  >
                    Continuar pedido
                  </Link>
                  <button
                    type="button"
                    disabled={busy || isOffline}
                    onClick={() => void openVerCuenta(table)}
                    className="min-h-11 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    Ver cuenta
                  </button>
                  <button
                    type="button"
                    disabled={busy || isOffline || running <= 0}
                    onClick={() => void openCobrarMesa(table)}
                    className="min-h-11 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Cobrar mesa
                  </button>
                  {table.status === "occupied" ? (
                    <button
                      type="button"
                      disabled={busy || isOffline}
                      onClick={() => void setWaitingPayment(table)}
                      className="min-h-10 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50"
                    >
                      Marcar esperando pago
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || isOffline || cancelMesaBusy}
                    onClick={() => setCancelMesaTarget(table)}
                    className="min-h-11 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-950/70 disabled:opacity-50"
                  >
                    Cancelar mesa
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-zinc-50">Mesas</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Barra arriba; mesas 1–3 izquierda, 4–6 derecha. Al abrir una mesa
            puedes poner un nombre opcional para cocina y caja. La mesa pasa a
            ocupada al enviar la primera comanda a cocina. En mesa ocupada
            continúa el pedido o cobra.
          </p>
        </div>
        <Link
          href="/cashier"
          className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
        >
          Volver al panel
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-zinc-500">Cargando mesas…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {barra ? (
            <div className="w-full">{tableTile(barra)}</div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              {mesasLeft.map((t) => tableTile(t))}
            </div>
            <div className="flex flex-col gap-4">
              {mesasRight.map((t) => tableTile(t))}
            </div>
          </div>
        </div>
      )}

      {cuentaTable ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-zinc-50">
                  Cuenta — {cuentaTable.name}
                </h3>
                <p className="text-sm text-zinc-500">Pedidos sin cobrar</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCuentaTable(null);
                  setCuentaOrders([]);
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300"
              >
                Cerrar
              </button>
            </div>
            {cuentaLoading ? (
              <p className="text-zinc-500">Cargando…</p>
            ) : cuentaOrders.length === 0 ? (
              <p className="text-zinc-500">No hay consumos pendientes.</p>
            ) : (
              <>
                <ul className="space-y-4 border-b border-zinc-800 pb-4">
                  {cuentaOrders.map((o) => (
                    <li key={o.id} className="rounded-lg border border-zinc-800 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-xs text-zinc-500">
                          {new Date(o.created_at).toLocaleString("es-MX")} · $
                          {Number(o.total).toFixed(2)}
                        </p>
                        <button
                          type="button"
                          disabled={isOffline || deleteOrderBusy}
                          onClick={() => setDeleteOrderTarget(o.id)}
                          className="shrink-0 rounded-md border border-red-800 bg-red-950/50 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-950/80 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                        {(o.order_items ?? []).map((it) => (
                          <li key={it.id}>
                            {it.quantity}×{" "}
                            {productNames[it.product_id] ?? "Producto"} (
                            {sizeChoiceLabelEs(String(it.size))}) · $
                            {(Number(it.unit_price) * it.quantity).toFixed(2)}
                            {parseCustomizations(it.customizations).length ? (
                              <span className="text-zinc-500">
                                {" "}
                                ·{" "}
                                {parseCustomizations(it.customizations).join(
                                  ", ",
                                )}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-right text-lg font-black text-rondaCream">
                  Total: $
                  {cuentaOrders
                    .reduce((s, o) => s + (Number(o.total) || 0), 0)
                    .toFixed(2)}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {openMesaTarget ? (
        <div className="fixed inset-0 z-[54] flex items-end justify-center bg-black/80 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <h3 className="text-xl font-bold text-zinc-50">
              Abrir {openMesaTarget.name}
            </h3>
            <p className="mt-3 text-sm text-zinc-400">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Nombre (opcional)
              </label>
              <input
                type="text"
                value={openMesaName}
                onChange={(e) => setOpenMesaName(e.target.value)}
                placeholder="Ej: Juan, Familia García…"
                className="h-11 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm text-zinc-100"
                autoComplete="off"
                disabled={openMesaBusy}
              />
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={openMesaBusy}
                onClick={() => {
                  setOpenMesaTarget(null);
                  setOpenMesaName("");
                }}
                className="h-11 flex-1 rounded-lg border border-zinc-600 font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={openMesaBusy}
                onClick={() => void confirmAbrirMesa()}
                className="h-11 flex-1 rounded-lg bg-rondaAccent font-bold text-rondaCream hover:bg-rondaAccentHover disabled:opacity-50"
              >
                {openMesaBusy ? "…" : "Abrir mesa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelMesaTarget ? (
        <div className="fixed inset-0 z-[52] flex items-end justify-center bg-black/80 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-zinc-950 p-5 shadow-2xl">
            <p className="text-lg font-bold text-zinc-50">
              ¿Cancelar mesa {cancelMesaTarget.name}?
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Se eliminarán todos los pedidos abiertos.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={cancelMesaBusy}
                onClick={() => setCancelMesaTarget(null)}
                className="h-11 flex-1 rounded-lg border border-zinc-600 font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              >
                No, volver
              </button>
              <button
                type="button"
                disabled={cancelMesaBusy}
                onClick={() => void confirmCancelMesa()}
                className="h-11 flex-1 rounded-lg bg-red-700 font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {cancelMesaBusy ? "Eliminando…" : "Sí, cancelar mesa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cuentaTable && deleteOrderTarget ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-red-900/50 bg-zinc-950 p-5 shadow-2xl">
            <p className="text-lg font-bold text-zinc-50">
              ¿Eliminar esta comanda?
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Se borrarán sus ítems y no se podrá deshacer.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={deleteOrderBusy}
                onClick={() => setDeleteOrderTarget(null)}
                className="h-11 flex-1 rounded-lg border border-zinc-600 font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={deleteOrderBusy}
                onClick={() => void confirmDeleteSingleOrder()}
                className="h-11 flex-1 rounded-lg bg-red-700 font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleteOrderBusy ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cobrarTable ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-zinc-50">
                  Cobrar — {cobrarTable.name}
                </h3>
                <p className="text-sm tabular-nums text-zinc-400">
                  Total mesa:{" "}
                  <span className="font-bold text-rondaCream">
                    ${cobrarGrandTotal.toFixed(2)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCobrarTable(null);
                  setCobrarOrders([]);
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-300"
              >
                Cancelar
              </button>
            </div>

            {cobrarLoading ? (
              <p className="text-zinc-500">Cargando…</p>
            ) : cobrarOrders.length === 0 ? (
              <p className="text-zinc-500">No hay pedidos por cobrar.</p>
            ) : (
              <>
                <p className="mb-3 text-xs font-semibold uppercase text-zinc-500">
                  Método de pago
                </p>
                <div className="mb-4 flex gap-2">
                  {(["cash", "card", "mixed"] as const).map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={
                        paymentMethod === pm
                          ? "flex-1 rounded-lg bg-rondaAccent py-2 text-xs font-bold text-rondaCream"
                          : "flex-1 rounded-lg border border-zinc-700 py-2 text-xs font-semibold text-zinc-300"
                      }
                    >
                      {pm === "cash"
                        ? "Efectivo"
                        : pm === "card"
                          ? "Tarjeta"
                          : "Mixto"}
                    </button>
                  ))}
                </div>
                {paymentMethod === "mixed" ? (
                  <div className="mb-4 space-y-2">
                    <label className="block text-xs text-zinc-400">
                      Efectivo $
                    </label>
                    <input
                      type="number"
                      className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-zinc-100"
                      value={mixedCash}
                      onChange={(e) => setMixedCash(e.target.value)}
                    />
                    <label className="block text-xs text-zinc-400">
                      Tarjeta $
                    </label>
                    <input
                      type="number"
                      className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-zinc-100"
                      value={mixedCard}
                      onChange={(e) => setMixedCard(e.target.value)}
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={cobrarBusy}
                  onClick={() => void confirmCobrarMesa()}
                  className="h-12 w-full rounded-lg bg-emerald-700 text-base font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {cobrarBusy ? "Procesando…" : "Confirmar cobro y liberar mesa"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
