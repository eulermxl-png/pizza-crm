"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button, Card, KpiCard, Segmented, cn, inputCls, IconAlert, IconCoins, IconPackage, IconCart } from "@/components/ui";

import ClientDetail from "./ClientDetail";
import {
  RISK_DAYS,
  STATUSES,
  daysBetween,
  money,
  round2,
  statusMeta,
  todayYmd,
  addDaysYmd,
  type ClientStatus,
  type CrmClientRow,
  type PaymentLite,
  type ProductLite,
  type SaleLite,
  type Staff,
} from "./types";

type View = "pendientes" | "clientes";
type DetailTab = "datos" | "bitacora" | "venta" | "pago";

type ClientStats = {
  lastSale: string | null;
  balance: number;
  soldMonth: number;
};

export default function CrmClient() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayYmd();

  const [view, setView] = useState<View>("pendientes");
  const [clients, setClients] = useState<CrmClientRow[]>([]);
  const [sales, setSales] = useState<SaleLite[]>([]);
  const [payments, setPayments] = useState<PaymentLite[]>([]);
  const [weekQty, setWeekQty] = useState(0);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ClientStatus | "todos">("todos");
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const [detail, setDetail] = useState<{ id: string | null; tab: DetailTab } | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    const weekFrom = addDaysYmd(todayYmd(), -6);
    const [cRes, sRes, pRes, wRes] = await Promise.all([
      supabase
        .from("wholesale_clients")
        .select(
          "id,name,contact,phone,status,business_type,source,agreed_price,expected_weekly_qty,next_follow_up,assigned_to,lost_reason,notes",
        )
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase.from("wholesale_sales").select("id,client_id,sold_at,total,amount_paid,merma,notes"),
      supabase.from("wholesale_payments").select("id,client_id,sale_id,amount,paid_at,method,notes"),
      supabase
        .from("wholesale_sales")
        .select("id, wholesale_sale_items(quantity)")
        .gte("sold_at", weekFrom)
        .eq("merma", false),
    ]);
    if (cRes.error) setError(cRes.error.message);
    setClients(
      ((cRes.data ?? []) as Array<CrmClientRow & { agreed_price: number | string | null }>).map((c) => ({
        ...c,
        agreed_price: c.agreed_price == null ? null : Number(c.agreed_price),
      })),
    );
    setSales(
      ((sRes.data ?? []) as Array<SaleLite & { total: number | string; amount_paid: number | string }>).map((s) => ({
        ...s,
        sold_at: String(s.sold_at).slice(0, 10),
        total: Number(s.total),
        amount_paid: Number(s.amount_paid),
        merma: s.merma === true,
      })),
    );
    setPayments(
      ((pRes.data ?? []) as Array<PaymentLite & { amount: number | string }>).map((p) => ({
        ...p,
        paid_at: String(p.paid_at).slice(0, 10),
        amount: Number(p.amount),
      })),
    );
    const wk = ((wRes.data ?? []) as Array<{ wholesale_sale_items: { quantity: number }[] | null }>).reduce(
      (a, s) => a + (s.wholesale_sale_items ?? []).reduce((b, it) => b + (it.quantity ?? 0), 0),
      0,
    );
    setWeekQty(wk);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      const [st, pr] = await Promise.all([
        supabase.rpc("crm_staff"),
        supabase
          .from("products")
          .select("id,name,has_sizes,is_combo,wholesale_only,active")
          .eq("active", true)
          .eq("is_combo", false)
          .eq("wholesale_only", true)
          .order("name", { ascending: true }),
      ]);
      setStaff(((st.data ?? []) as Staff[]) ?? []);
      setProducts(
        ((pr.data ?? []) as Array<{ id: string; name: string; has_sizes: boolean | null }>).map((p) => ({
          id: p.id,
          name: p.name,
          has_sizes: p.has_sizes !== false,
        })),
      );
      await loadAll();
      setLoading(false);
    })();
  }, [supabase, loadAll]);

  // Estadísticas por cliente
  const stats = useMemo(() => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const map = new Map<string, ClientStats>();
    const get = (id: string) => {
      let s = map.get(id);
      if (!s) {
        s = { lastSale: null, balance: 0, soldMonth: 0 };
        map.set(id, s);
      }
      return s;
    };
    for (const s of sales) {
      const st = get(s.client_id);
      if (!s.merma) {
        st.balance -= s.total;
        if (s.sold_at >= monthStart) st.soldMonth += s.total;
      }
      if (!st.lastSale || s.sold_at > st.lastSale) st.lastSale = s.sold_at;
    }
    for (const p of payments) get(p.client_id).balance += p.amount;
    for (const v of Array.from(map.values())) {
      v.balance = round2(v.balance);
      v.soldMonth = round2(v.soldMonth);
    }
    return map;
  }, [sales, payments, today]);
  const statOf = (id: string): ClientStats => stats.get(id) ?? { lastSale: null, balance: 0, soldMonth: 0 };

  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  // KPIs
  const activeCount = clients.filter((c) => c.status === "activo").length;
  const monthSales = round2(Array.from(stats.values()).reduce((a, s) => a + s.soldMonth, 0));
  const owedTotal = round2(
    Array.from(stats.values()).reduce((a, s) => a + (s.balance < 0 ? -s.balance : 0), 0),
  );

  const scoped = useMemo(
    () => (onlyMine && userId ? clients.filter((c) => c.assigned_to === userId) : clients),
    [clients, onlyMine, userId],
  );

  const followUps = useMemo(
    () =>
      scoped
        .filter((c) => c.next_follow_up && c.next_follow_up <= today && c.status !== "perdido")
        .sort((a, b) => (a.next_follow_up ?? "").localeCompare(b.next_follow_up ?? "")),
    [scoped, today],
  );
  const upcoming = useMemo(
    () =>
      scoped
        .filter(
          (c) =>
            c.next_follow_up &&
            c.next_follow_up > today &&
            c.next_follow_up <= addDaysYmd(today, 7) &&
            c.status !== "perdido",
        )
        .sort((a, b) => (a.next_follow_up ?? "").localeCompare(b.next_follow_up ?? "")),
    [scoped, today],
  );
  const atRisk = useMemo(
    () =>
      scoped
        .filter((c) => {
          if (c.status !== "activo") return false;
          const last = statOf(c.id).lastSale;
          return !last || daysBetween(last, today) >= RISK_DAYS;
        })
        .sort((a, b) => (statOf(a.id).lastSale ?? "").localeCompare(statOf(b.id).lastSale ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, stats, today],
  );
  const noFollowUp = useMemo(
    () =>
      scoped.filter(
        (c) => !c.next_follow_up && ["prospecto", "contactado", "muestra", "negociando"].includes(c.status),
      ),
    [scoped],
  );

  const funnel = useMemo(
    () => STATUSES.map((s) => ({ ...s, count: scoped.filter((c) => c.status === s.key).length })),
    [scoped],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(
      (c) =>
        (statusFilter === "todos" || c.status === statusFilter) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          (c.contact ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q)),
    );
  }, [scoped, statusFilter, search]);

  const detailClient = detail?.id ? clients.find((c) => c.id === detail.id) ?? null : null;

  async function handleChanged(clientId?: string) {
    await loadAll();
    if (clientId && detail && detail.id === null) {
      // Recién creado: abrir su ficha en Bitácora
      setDetail({ id: clientId, tab: "bitacora" });
    }
  }

  function StatusPill({ status }: { status: string }) {
    const m = statusMeta(status);
    return (
      <span
        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold"
        style={{ color: m.color, border: `1px solid ${m.color}` }}
      >
        {m.label}
      </span>
    );
  }

  function ClientLine({ c, right }: { c: CrmClientRow; right: React.ReactNode }) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setDetail({ id: c.id, tab: "bitacora" })}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface2"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-rondaCream">{c.name}</p>
            <p className="truncate text-xs text-muted2">
              {[c.contact, c.phone].filter(Boolean).join(" · ") || "Sin contacto"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-right text-xs">
            <StatusPill status={c.status} />
            {right}
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard tone="ok" icon={<IconCart size={20} />} label="Clientes activos" value={String(activeCount)} />
        <KpiCard
          tone="brand"
          icon={<IconPackage size={20} />}
          label="Pizzas últimos 7 días"
          value={String(weekQty)}
        />
        <KpiCard tone="ok" icon={<IconCoins size={20} />} label="Ventas del mes" value={money(monthSales)} />
        <KpiCard
          tone="danger"
          valueTone={owedTotal > 0 ? "danger" : undefined}
          icon={<IconAlert size={20} />}
          label="Por cobrar (todos)"
          value={money(owedTotal)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          size="md"
          options={[
            { key: "pendientes", label: `Pendientes (${followUps.length + atRisk.length})` },
            { key: "clientes", label: `Clientes (${scoped.length})` },
          ]}
          value={view}
          onChange={setView}
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="h-4 w-4"
            />
            Solo mis clientes
          </label>
          <Button variant="primary" onClick={() => setDetail({ id: null, tab: "datos" })}>
            + Nuevo prospecto
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Cargando…</p>
      ) : view === "pendientes" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card padded={false} className="overflow-hidden">
            <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted2">
              Seguimientos de hoy y vencidos ({followUps.length})
            </p>
            {followUps.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">Nada pendiente para hoy.</p>
            ) : (
              <ul className="divide-y divide-line">
                {followUps.map((c) => {
                  const late = daysBetween(c.next_follow_up as string, today);
                  return (
                    <ClientLine
                      key={c.id}
                      c={c}
                      right={
                        <span className="font-bold" style={{ color: late > 0 ? "var(--danger)" : "var(--amber)" }}>
                          {late > 0 ? `Vencido ${late} d` : "Hoy"}
                        </span>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted2">
              Clientes en riesgo · sin pedido en {RISK_DAYS}+ días ({atRisk.length})
            </p>
            {atRisk.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">Todos los activos están pidiendo.</p>
            ) : (
              <ul className="divide-y divide-line">
                {atRisk.map((c) => {
                  const last = statOf(c.id).lastSale;
                  return (
                    <ClientLine
                      key={c.id}
                      c={c}
                      right={
                        <span className="font-bold" style={{ color: "var(--warn)" }}>
                          {last ? `${daysBetween(last, today)} d` : "Sin pedidos"}
                        </span>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted2">
              Próximos 7 días ({upcoming.length})
            </p>
            {upcoming.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">Sin seguimientos programados.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((c) => (
                  <ClientLine key={c.id} c={c} right={<span className="text-muted">{c.next_follow_up}</span>} />
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">Embudo</p>
            <div className="space-y-1.5">
              {funnel.map((f) => {
                const max = Math.max(1, ...funnel.map((x) => x.count));
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(f.key);
                      setView("clientes");
                    }}
                    className="flex w-full items-center gap-3 text-left text-sm"
                  >
                    <span className="w-24 shrink-0 text-muted">{f.label}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded-full bg-surface2">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(f.count / max) * 100}%`, background: f.color, minWidth: f.count ? 6 : 0 }}
                      />
                    </span>
                    <span className="nums w-8 text-right font-bold text-rondaCream">{f.count}</span>
                  </button>
                );
              })}
            </div>
            {noFollowUp.length > 0 ? (
              <p className="text-xs" style={{ color: "var(--amber)" }}>
                {noFollowUp.length} prospecto(s) sin próximo seguimiento. Ponles fecha para que no se enfríen.
              </p>
            ) : null}
          </Card>
        </div>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar negocio, contacto o teléfono"
              className={cn(inputCls, "h-10 min-w-[12rem] flex-1")}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ClientStatus | "todos")}
              className={cn(inputCls, "h-10 w-44")}
            >
              <option value="todos">Todos los estatus</option>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-muted">Sin clientes con ese filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm text-rondaCream">
                <thead className="border-b border-line bg-surface2 text-xs uppercase tracking-wide text-muted2">
                  <tr>
                    <th className="px-4 py-3 font-medium">Negocio</th>
                    <th className="px-4 py-3 font-medium">Estatus</th>
                    <th className="px-4 py-3 font-medium">Responsable</th>
                    <th className="px-4 py-3 font-medium">Seguimiento</th>
                    <th className="px-4 py-3 font-medium">Última venta</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const st = statOf(c.id);
                    const late = c.next_follow_up ? daysBetween(c.next_follow_up, today) : null;
                    return (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface2">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setDetail({ id: c.id, tab: "datos" })}
                            className="text-left font-semibold hover:underline"
                          >
                            {c.name}
                          </button>
                          <span className="block text-xs text-muted2">
                            {[c.business_type, c.contact, c.phone].filter(Boolean).join(" · ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {c.assigned_to ? staffName.get(c.assigned_to) ?? "—" : "—"}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={late != null && late > 0 ? { color: "var(--danger)" } : undefined}
                        >
                          {c.next_follow_up ?? <span className="text-muted2">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted">{st.lastSale ?? "—"}</td>
                        <td
                          className="nums px-4 py-3 text-right font-semibold"
                          style={{
                            color: st.balance < -0.001 ? "var(--danger)" : st.balance > 0.001 ? "var(--ok)" : undefined,
                          }}
                        >
                          {st.balance < -0.001 ? "−" : ""}
                          {money(Math.abs(st.balance))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetail({ id: c.id, tab: "bitacora" })}
                              className="h-8 rounded-lg border border-line px-2 text-xs font-bold hover:bg-surface3"
                            >
                              Actividad
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetail({ id: c.id, tab: "venta" })}
                              className="h-8 rounded-lg border border-line px-2 text-xs font-bold hover:bg-surface3"
                            >
                              Venta
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetail({ id: c.id, tab: "pago" })}
                              className="h-8 rounded-lg border border-line px-2 text-xs font-bold hover:bg-surface3"
                            >
                              Pago
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {detail ? (
        <ClientDetail
          key={`${detail.id ?? "new"}-${detail.tab}`}
          supabase={supabase}
          client={detailClient}
          sales={sales}
          payments={payments}
          staff={staff}
          products={products}
          currentUserId={userId}
          initialTab={detail.tab}
          onClose={() => setDetail(null)}
          onChanged={handleChanged}
        />
      ) : null}
    </div>
  );
}
