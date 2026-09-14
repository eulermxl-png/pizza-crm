"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  SIZE_KEYS,
  SIZE_LABELS_ES,
  STANDARD_PRODUCT_SIZE,
  sizeChoiceLabelEs,
  type SizeKey,
} from "@/modules/menu/constants";
import {
  Button,
  Card,
  Field,
  KpiCard,
  cn,
  inputCls,
  IconCoins,
  IconAlert,
} from "@/components/ui";

const money = (n: number) =>
  n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const round2 = (n: number) => Math.round(n * 100) / 100;

function todayYmd(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

type Client = { id: string; name: string; contact: string | null };

type ProductLite = {
  id: string;
  name: string;
  has_sizes: boolean;
};

type DraftLine = {
  key: string;
  productId: string;
  size: SizeKey;
  quantity: number;
  unitPrice: string;
};

type SaleItem = {
  productName: string;
  size: string;
  quantity: number;
  unit_price: number;
};

type Sale = {
  id: string;
  sold_at: string;
  total: number;
  amount_paid: number;
  paid: boolean;
  merma: boolean;
  notes: string | null;
  items: SaleItem[];
};

function newLine(productId: string): DraftLine {
  return {
    key: crypto.randomUUID(),
    productId,
    size: "medium",
    quantity: 1,
    unitPrice: "",
  };
}

/** Estado derivado de la venta a partir de lo cobrado. */
function saleStatus(s: Sale): { label: string; color: string } {
  if (s.merma) return { label: "Merma", color: "var(--warn)" };
  if (s.total > 0 && s.amount_paid >= s.total - 0.001)
    return { label: "Pagada", color: "var(--ok)" };
  if (s.amount_paid > 0) return { label: "Parcial", color: "var(--amber)" };
  return { label: "Pendiente", color: "var(--danger)" };
}

export default function WholesaleClient() {
  const supabase = useMemo(() => createClient(), []);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const [showNewClient, setShowNewClient] = useState(false);
  const [ncName, setNcName] = useState("");
  const [ncContact, setNcContact] = useState("");

  const [saleDate, setSaleDate] = useState(() => todayYmd());
  const [saleNotes, setSaleNotes] = useState("");
  const [saleCredit, setSaleCredit] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [onlyOwing, setOnlyOwing] = useState(false);
  const [cobro, setCobro] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from("wholesale_clients")
      .select("id,name,contact")
      .eq("active", true)
      .order("name", { ascending: true });
    const list = (data ?? []) as Client[];
    setClients(list);
    setClientId((cur) => cur || (list[0]?.id ?? ""));
  }, [supabase]);

  const loadProducts = useCallback(async () => {
    // Mayoreo muestra solo los productos marcados "solo mayoreo" (congeladas).
    const { data } = await supabase
      .from("products")
      .select("id,name,has_sizes,is_combo,wholesale_only,active")
      .eq("active", true)
      .eq("is_combo", false)
      .eq("wholesale_only", true)
      .order("name", { ascending: true });
    const mapped: ProductLite[] = ((data ?? []) as Array<{
      id: string;
      name: string;
      has_sizes: boolean | null;
    }>).map((p) => ({
      id: p.id,
      name: p.name,
      has_sizes: p.has_sizes !== false,
    }));
    setProducts(mapped);
  }, [supabase]);

  const loadSales = useCallback(async () => {
    if (!clientId) {
      setSales([]);
      return;
    }
    const { data: saleRows, error: sErr } = await supabase
      .from("wholesale_sales")
      .select("id,sold_at,total,amount_paid,paid,merma,notes")
      .eq("client_id", clientId)
      .order("sold_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (sErr) {
      setError(sErr.message);
      setSales([]);
      return;
    }
    const rows = (saleRows ?? []) as Array<{
      id: string;
      sold_at: string;
      total: number;
      amount_paid: number;
      paid: boolean;
      merma: boolean;
      notes: string | null;
    }>;
    const ids = rows.map((r) => r.id);
    let itemsBySale = new Map<string, SaleItem[]>();
    if (ids.length > 0) {
      const { data: itemRows } = await supabase
        .from("wholesale_sale_items")
        .select("sale_id,product_id,size,quantity,unit_price")
        .in("sale_id", ids);
      itemsBySale = new Map();
      for (const it of (itemRows ?? []) as Array<{
        sale_id: string;
        product_id: string;
        size: string;
        quantity: number;
        unit_price: number;
      }>) {
        const arr = itemsBySale.get(it.sale_id) ?? [];
        arr.push({
          productName: productsById.get(it.product_id)?.name ?? "Producto",
          size: it.size,
          quantity: it.quantity,
          unit_price: Number(it.unit_price),
        });
        itemsBySale.set(it.sale_id, arr);
      }
    }
    setSales(
      rows.map((r) => ({
        id: r.id,
        sold_at: String(r.sold_at).slice(0, 10),
        total: Number(r.total),
        amount_paid: Number(r.amount_paid),
        paid: r.paid,
        merma: r.merma === true,
        notes: r.notes,
        items: itemsBySale.get(r.id) ?? [],
      })),
    );
  }, [supabase, clientId, productsById]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadClients(), loadProducts()]);
      setLoading(false);
    })();
  }, [loadClients, loadProducts]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  // Arranca con un renglón listo para escoger producto.
  useEffect(() => {
    if (products.length > 0) {
      setLines((prev) => (prev.length === 0 ? [newLine(products[0].id)] : prev));
    }
  }, [products]);

  const pendingTotal = useMemo(
    () =>
      round2(
        sales
          .filter((s) => !s.merma)
          .reduce((a, s) => a + Math.max(0, s.total - s.amount_paid), 0),
      ),
    [sales],
  );
  const collectedTotal = useMemo(
    () =>
      round2(sales.filter((s) => !s.merma).reduce((a, s) => a + s.amount_paid, 0)),
    [sales],
  );
  const mermaTotal = useMemo(
    () => round2(sales.filter((s) => s.merma).reduce((a, s) => a + s.total, 0)),
    [sales],
  );

  const draftTotal = useMemo(
    () =>
      round2(
        lines.reduce((a, l) => a + (Number(l.unitPrice) || 0) * l.quantity, 0),
      ),
    [lines],
  );

  const visibleSales = useMemo(
    () =>
      onlyOwing
        ? sales.filter((s) => !s.merma && s.total - s.amount_paid > 0.001)
        : sales,
    [sales, onlyOwing],
  );

  function addProductLine() {
    setLines((prev) => [...prev, newLine(products[0]?.id ?? "")]);
  }
  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function addClientInline() {
    const name = ncName.trim();
    if (!name) return;
    setError(null);
    const { data, error: insErr } = await supabase
      .from("wholesale_clients")
      .insert({ name, contact: ncContact.trim() || null })
      .select("id,name,contact")
      .single();
    if (insErr) {
      setError(
        insErr.code === "23505"
          ? "Ya existe un cliente con ese nombre."
          : insErr.message,
      );
      return;
    }
    setNcName("");
    setNcContact("");
    setShowNewClient(false);
    await loadClients();
    if (data?.id) setClientId(data.id);
  }

  async function registerPayment(sale: Sale, amountStr: string) {
    const amt = Number(amountStr);
    if (!(amt > 0)) {
      setError("Ingresa un monto de cobro válido.");
      return;
    }
    setError(null);
    const newPaid = Math.min(sale.total, round2(sale.amount_paid + amt));
    const fully = newPaid >= sale.total - 0.001;
    const { error: upErr } = await supabase
      .from("wholesale_sales")
      .update({
        amount_paid: newPaid,
        paid: fully,
        paid_at: fully ? new Date().toISOString() : null,
        merma: false,
        merma_at: null,
      })
      .eq("id", sale.id);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setCobro((c) => ({ ...c, [sale.id]: "" }));
    await loadSales();
  }

  async function payFull(sale: Sale) {
    await registerPayment(sale, String(round2(sale.total - sale.amount_paid)));
  }

  async function markMerma(sale: Sale) {
    setError(null);
    const { error: upErr } = await supabase
      .from("wholesale_sales")
      .update({ merma: true, merma_at: new Date().toISOString() })
      .eq("id", sale.id);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    await loadSales();
  }

  async function reopen(sale: Sale) {
    setError(null);
    const { error: upErr } = await supabase
      .from("wholesale_sales")
      .update({
        paid: false,
        paid_at: null,
        merma: false,
        merma_at: null,
        amount_paid: 0,
      })
      .eq("id", sale.id);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    await loadSales();
  }

  async function saveSale() {
    setError(null);
    setNotice(null);
    if (!clientId) {
      setError("Elige un cliente.");
      return;
    }
    const valid = lines.filter(
      (l) => l.productId && l.quantity > 0 && Number(l.unitPrice) >= 0,
    );
    if (valid.length === 0) {
      setError("Agrega al menos un producto con cantidad y precio.");
      return;
    }
    setSaving(true);
    try {
      const paidNow = !saleCredit;
      const { data: sale, error: sErr } = await supabase
        .from("wholesale_sales")
        .insert({
          client_id: clientId,
          sold_at: saleDate,
          total: draftTotal,
          amount_paid: paidNow ? draftTotal : 0,
          paid: paidNow,
          paid_at: paidNow ? new Date().toISOString() : null,
          notes: saleNotes.trim() || null,
        })
        .select("id")
        .single();
      if (sErr) throw new Error(sErr.message);
      if (!sale?.id) throw new Error("No se creó la venta.");

      const itemRows = valid.map((l) => {
        const p = productsById.get(l.productId);
        const hasSizes = p?.has_sizes !== false;
        return {
          sale_id: sale.id,
          product_id: l.productId,
          size: hasSizes ? l.size : STANDARD_PRODUCT_SIZE,
          quantity: l.quantity,
          unit_price: Number(l.unitPrice) || 0,
        };
      });
      const { error: iErr } = await supabase
        .from("wholesale_sale_items")
        .insert(itemRows);
      if (iErr) throw new Error(iErr.message);

      // Descuenta inventario por receta (idempotente).
      const { error: consErr } = await supabase.rpc(
        "apply_wholesale_consumption",
        { p_sale_id: sale.id },
      );
      setNotice(
        consErr
          ? "Venta registrada, pero el descuento de inventario falló: " +
              consErr.message
          : "Venta registrada y descontada de inventario.",
      );

      setLines(products[0] ? [newLine(products[0].id)] : []);
      setSaleNotes("");
      setSaleCredit(false);
      setSaleDate(todayYmd());
      await loadSales();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la venta.");
    } finally {
      setSaving(false);
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Mayoreo</h2>
        <p className="mt-2 max-w-3xl text-muted">
          Venta de pizzas congeladas a clientes de mayoreo (ej. Sume). Cada venta
          descuenta inventario por receta y no entra en las ventas del
          restaurante ni en el corte de caja.
        </p>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-transparent p-3 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          className="rounded-xl border border-transparent p-3 text-sm"
          style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
        >
          {notice}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted">Cargando…</p>
      ) : (
        <>
          {/* Cliente */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted2">
                Cliente de mayoreo
              </p>
              <button
                type="button"
                onClick={() => setShowNewClient((v) => !v)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {showNewClient ? "Cancelar" : "+ Nuevo cliente"}
              </button>
            </div>
            {showNewClient ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[10rem] flex-1">
                  <label className="mb-1 block text-xs text-muted2">Nombre</label>
                  <input
                    value={ncName}
                    onChange={(e) => setNcName(e.target.value)}
                    className={cn(inputCls, "h-11")}
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="mb-1 block text-xs text-muted2">
                    Contacto (opcional)
                  </label>
                  <input
                    value={ncContact}
                    onChange={(e) => setNcContact(e.target.value)}
                    className={cn(inputCls, "h-11")}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => void addClientInline()}
                  disabled={!ncName.trim()}
                >
                  Dar de alta
                </Button>
              </div>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={cn(inputCls, "h-11")}
              >
                {clients.length === 0 ? (
                  <option value="">Sin clientes — crea uno</option>
                ) : null}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Card>

          {/* KPIs del cliente */}
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              tone="danger"
              valueTone={pendingTotal > 0 ? "danger" : undefined}
              icon={<IconAlert size={20} />}
              label={`Por cobrar${selectedClient ? ` · ${selectedClient.name}` : ""}`}
              value={money(pendingTotal)}
            />
            <KpiCard
              tone="ok"
              icon={<IconCoins size={20} />}
              label="Cobrado"
              value={money(collectedTotal)}
            />
            <KpiCard
              tone="warn"
              valueTone={mermaTotal > 0 ? "warn" : undefined}
              icon={<IconAlert size={20} />}
              label="Merma (devueltas)"
              value={money(mermaTotal)}
            />
          </div>

          {/* Nueva venta */}
          <Card className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">
              Registrar venta
            </p>

            <div className="flex flex-wrap gap-3">
              <Field label="Fecha" className="w-44">
                <input
                  type="date"
                  value={saleDate}
                  max={todayYmd()}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className={cn(inputCls, "input-date-dark h-11")}
                />
              </Field>
              <Field label="Notas (opcional)" className="min-w-[12rem] flex-1">
                <input
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Ej. entrega en barra"
                  className={cn(inputCls, "h-11")}
                />
              </Field>
            </div>

            {products.length === 0 ? (
              <p
                className="rounded-lg p-3 text-sm"
                style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
              >
                No hay productos de mayoreo. En Menú, crea la pizza congelada y
                marca &quot;Solo mayoreo (pizza congelada)&quot;.
              </p>
            ) : lines.length === 0 ? (
              <p className="text-xs text-muted2">
                Sin productos. Agrega las pizzas de esta entrega.
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((l) => {
                  const p = productsById.get(l.productId);
                  const hasSizes = p?.has_sizes !== false;
                  return (
                    <div
                      key={l.key}
                      className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface2 p-2"
                    >
                      <div className="min-w-[10rem] flex-1">
                        <label className="mb-1 block text-xs text-muted2">
                          Pizza
                        </label>
                        <select
                          value={l.productId}
                          onChange={(e) =>
                            updateLine(l.key, { productId: e.target.value })
                          }
                          className={cn(inputCls, "h-10")}
                        >
                          {products.map((prod) => (
                            <option key={prod.id} value={prod.id}>
                              {prod.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className="mb-1 block text-xs text-muted2">
                          Tamaño
                        </label>
                        <select
                          value={l.size}
                          disabled={!hasSizes}
                          onChange={(e) =>
                            updateLine(l.key, { size: e.target.value as SizeKey })
                          }
                          className={cn(inputCls, "h-10 disabled:opacity-50")}
                        >
                          {hasSizes ? (
                            SIZE_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {SIZE_LABELS_ES[k]}
                              </option>
                            ))
                          ) : (
                            <option value="medium">Único</option>
                          )}
                        </select>
                      </div>
                      <div className="w-20">
                        <label className="mb-1 block text-xs text-muted2">
                          Cant.
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.key, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className={cn(inputCls, "nums h-10")}
                        />
                      </div>
                      <div className="w-28">
                        <label className="mb-1 block text-xs text-muted2">
                          Precio unit.
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={l.unitPrice}
                          placeholder="0.00"
                          onChange={(e) =>
                            updateLine(l.key, { unitPrice: e.target.value })
                          }
                          className={cn(inputCls, "nums h-10")}
                        />
                      </div>
                      <div className="w-24 text-right">
                        <label className="mb-1 block text-xs text-muted2">
                          Importe
                        </label>
                        <p className="nums h-10 pt-2 font-semibold text-rondaCream">
                          {money((Number(l.unitPrice) || 0) * l.quantity)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="mb-1 rounded-md border border-line px-2 py-2 text-xs text-muted hover:bg-surface3"
                      >
                        Quitar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="secondary"
                onClick={addProductLine}
                disabled={products.length === 0}
              >
                + Agregar producto
              </Button>
              <div className="text-right">
                <p className="text-xs text-muted2">Total de la venta</p>
                <p className="nums text-2xl font-black text-rondaCream">
                  {money(draftTotal)}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-rondaCream">
              <input
                type="checkbox"
                checked={saleCredit}
                onChange={(e) => setSaleCredit(e.target.checked)}
                className="h-5 w-5"
              />
              A crédito (queda pendiente por cobrar). Si no lo marcas, se asume
              pagada en esta entrega.
            </label>

            <Button
              variant="primary"
              className="h-12 w-full text-base"
              onClick={() => void saveSale()}
              disabled={saving || lines.length === 0 || !clientId}
            >
              {saving
                ? "Guardando…"
                : saleCredit
                  ? "Registrar venta a crédito"
                  : "Registrar venta (pagada)"}
            </Button>
          </Card>

          {/* Historial / cobranza */}
          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted2">
                Entregas {selectedClient ? `· ${selectedClient.name}` : ""}
              </p>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={onlyOwing}
                  onChange={(e) => setOnlyOwing(e.target.checked)}
                  className="h-4 w-4"
                />
                Solo con saldo (crédito)
              </label>
            </div>
            {visibleSales.length === 0 ? (
              <p className="p-8 text-center text-muted">
                {onlyOwing ? "Sin saldos por cobrar." : "Sin entregas registradas."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm text-rondaCream">
                  <thead className="border-b border-line bg-surface2 text-xs uppercase tracking-wide text-muted2">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Detalle</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-right font-medium">Saldo</th>
                      <th className="px-4 py-3 text-center font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Cobranza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSales.map((s) => {
                      const st = saleStatus(s);
                      const saldo = Math.max(0, round2(s.total - s.amount_paid));
                      const owing = !s.merma && saldo > 0.001;
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-line align-top last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">{s.sold_at}</td>
                          <td className="px-4 py-3 text-muted">
                            {s.items.length === 0
                              ? "—"
                              : s.items
                                  .map(
                                    (it) =>
                                      `${it.quantity}× ${it.productName} (${sizeChoiceLabelEs(it.size)})`,
                                  )
                                  .join(", ")}
                            {s.notes ? (
                              <span className="block text-xs text-muted2">
                                {s.notes}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className="nums px-4 py-3 text-right font-semibold"
                            style={s.merma ? { color: "var(--warn)" } : undefined}
                          >
                            {money(s.total)}
                          </td>
                          <td className="nums px-4 py-3 text-right">
                            {s.merma ? (
                              <span className="text-muted2">—</span>
                            ) : (
                              <span
                                style={{
                                  color: saldo > 0.001 ? "var(--danger)" : "var(--ok)",
                                }}
                              >
                                {money(saldo)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                              style={{ color: st.color, border: `1px solid ${st.color}` }}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {owing ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={cobro[s.id] ?? ""}
                                  placeholder="Monto"
                                  onChange={(e) =>
                                    setCobro((c) => ({
                                      ...c,
                                      [s.id]: e.target.value,
                                    }))
                                  }
                                  className={cn(inputCls, "nums h-9 w-24")}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void registerPayment(s, cobro[s.id] ?? "")
                                  }
                                  className="h-9 rounded-lg border border-line px-2 text-xs font-bold text-rondaCream hover:bg-surface3"
                                >
                                  Cobrar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void payFull(s)}
                                  className="h-9 rounded-lg px-2 text-xs font-bold text-white"
                                  style={{ background: "var(--ok)" }}
                                >
                                  Todo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void markMerma(s)}
                                  className="h-9 rounded-lg border border-line px-2 text-xs font-bold"
                                  style={{ color: "var(--warn)" }}
                                >
                                  Merma
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void reopen(s)}
                                className="h-9 rounded-lg border border-line px-2 text-xs font-semibold text-muted hover:bg-surface3"
                              >
                                Reabrir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
