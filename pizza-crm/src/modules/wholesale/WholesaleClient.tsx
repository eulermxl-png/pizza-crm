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

type Client = {
  id: string;
  name: string;
  contact: string | null;
  agreed_price: number | null;
};

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

type PayMethod = "efectivo" | "transferencia" | "tarjeta" | "otro";

const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

type Payment = {
  id: string;
  sale_id: string | null;
  amount: number;
  paid_at: string;
  method: PayMethod;
  notes: string | null;
};

function methodLabel(m: string): string {
  return PAY_METHODS.find((x) => x.value === m)?.label ?? m;
}

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
  const [deliveryPaid, setDeliveryPaid] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<PayMethod>("efectivo");
  const [payments, setPayments] = useState<Payment[]>([]);
  // Pago / anticipo
  const [pAmount, setPAmount] = useState("");
  const [pDate, setPDate] = useState(() => todayYmd());
  const [pMethod, setPMethod] = useState<PayMethod>("transferencia");
  const [pSaleId, setPSaleId] = useState("");
  const [pNotes, setPNotes] = useState("");
  const [cobroMethod, setCobroMethod] = useState<PayMethod>("efectivo");
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
      .select("id,name,contact,agreed_price")
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
      setPayments([]);
      return;
    }
    const { data: payRows, error: pErr } = await supabase
      .from("wholesale_payments")
      .select("id,sale_id,amount,paid_at,method,notes")
      .eq("client_id", clientId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (pErr) setError(pErr.message);
    setPayments(
      ((payRows ?? []) as Array<{
        id: string;
        sale_id: string | null;
        amount: number | string;
        paid_at: string;
        method: PayMethod;
        notes: string | null;
      }>).map((r) => ({
        id: r.id,
        sale_id: r.sale_id,
        amount: Number(r.amount),
        paid_at: String(r.paid_at).slice(0, 10),
        method: r.method,
        notes: r.notes,
      })),
    );
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

  const paymentsTotal = useMemo(
    () => round2(payments.reduce((a, p) => a + p.amount, 0)),
    [payments],
  );
  const salesTotal = useMemo(
    () => round2(sales.filter((s) => !s.merma).reduce((a, s) => a + s.total, 0)),
    [sales],
  );
  /** Positivo = saldo a favor del cliente; negativo = nos debe. */
  const balance = useMemo(
    () => round2(paymentsTotal - salesTotal),
    [paymentsTotal, salesTotal],
  );
  const creditAvailable = Math.max(0, balance);
  const pendingSales = useMemo(
    () =>
      sales
        .filter((s) => !s.merma && s.total - s.amount_paid > 0.001)
        .sort((a, b) => a.sold_at.localeCompare(b.sold_at)),
    [sales],
  );
  const salesById = useMemo(
    () => new Map(sales.map((s) => [s.id, s])),
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

  const deliveryDue = useMemo(
    () => round2(Math.max(0, draftTotal - creditAvailable)),
    [draftTotal, creditAvailable],
  );

  const visibleSales = useMemo(
    () =>
      onlyOwing
        ? sales.filter((s) => !s.merma && s.total - s.amount_paid > 0.001)
        : sales,
    [sales, onlyOwing],
  );

  // Precio acordado del cliente (CRM) como precio por default.
  const agreedPrice = clients.find((c) => c.id === clientId)?.agreed_price ?? null;
  useEffect(() => {
    if (agreedPrice == null) return;
    setLines((prev) =>
      prev.map((l) => (l.unitPrice === "" ? { ...l, unitPrice: String(agreedPrice) } : l)),
    );
  }, [agreedPrice, lines.length]);

  function addProductLine() {
    setLines((prev) => [
      ...prev,
      {
        ...newLine(products[0]?.id ?? ""),
        unitPrice: agreedPrice != null ? String(agreedPrice) : "",
      },
    ]);
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
      .select("id,name,contact,agreed_price")
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
    const { error: insErr } = await supabase.from("wholesale_payments").insert({
      client_id: clientId,
      sale_id: sale.id,
      amount: round2(amt),
      paid_at: todayYmd(),
      method: cobroMethod,
    });
    if (insErr) {
      setError(insErr.message);
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
      .update({ merma: false, merma_at: null })
      .eq("id", sale.id);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    await loadSales();
  }

  async function savePayment() {
    setError(null);
    setNotice(null);
    const amt = round2(Number(pAmount));
    if (!clientId) {
      setError("Elige un cliente.");
      return;
    }
    if (!(amt > 0)) {
      setError("Ingresa un monto válido.");
      return;
    }
    setSaving(true);
    const { error: insErr } = await supabase.from("wholesale_payments").insert({
      client_id: clientId,
      sale_id: pSaleId || null,
      amount: amt,
      paid_at: pDate,
      method: pMethod,
      notes: pNotes.trim() || null,
    });
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setNotice(
      pSaleId
        ? `Pago de ${money(amt)} aplicado a la venta.`
        : `Anticipo de ${money(amt)} registrado en el saldo del cliente.`,
    );
    setPAmount("");
    setPNotes("");
    setPSaleId("");
    setPDate(todayYmd());
    await loadSales();
  }

  async function deletePayment(pay: Payment) {
    if (
      !window.confirm(
        `¿Eliminar el pago de ${money(pay.amount)} del ${pay.paid_at}? El saldo se recalcula.`,
      )
    )
      return;
    setError(null);
    const { error: delErr } = await supabase
      .from("wholesale_payments")
      .delete()
      .eq("id", pay.id);
    if (delErr) {
      setError(delErr.message);
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
    if (lines.some((l) => l.productId && !(l.quantity > 0))) {
      setError("Falta la cantidad en algún producto.");
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
      const paidAmt = round2(Number(deliveryPaid) || 0);
      if (paidAmt < 0) throw new Error("El monto cobrado no puede ser negativo.");
      const { data: sale, error: sErr } = await supabase
        .from("wholesale_sales")
        .insert({
          client_id: clientId,
          sold_at: saleDate,
          total: draftTotal,
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

      // Cobro en la entrega (el saldo a favor ya se aplicó solo al crear la venta).
      let payMsg = "";
      if (paidAmt > 0) {
        const { error: payErr } = await supabase
          .from("wholesale_payments")
          .insert({
            client_id: clientId,
            sale_id: sale.id,
            amount: paidAmt,
            paid_at: saleDate,
            method: deliveryMethod,
          });
        payMsg = payErr
          ? ` El cobro no se guardó: ${payErr.message}`
          : ` Cobrado en la entrega: ${money(paidAmt)}.`;
      }

      // Descuenta inventario por receta (idempotente).
      const { error: consErr } = await supabase.rpc(
        "apply_wholesale_consumption",
        { p_sale_id: sale.id },
      );
      setNotice(
        consErr
          ? "Venta registrada, pero el descuento de inventario falló: " +
              consErr.message
          : "Venta registrada y descontada de inventario." + payMsg,
      );

      setLines(products[0] ? [newLine(products[0].id)] : []);
      setSaleNotes("");
      setDeliveryPaid("");
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
              tone={balance < 0 ? "danger" : "ok"}
              valueTone={balance < -0.001 ? "danger" : balance > 0.001 ? "ok" : undefined}
              icon={balance < 0 ? <IconAlert size={20} /> : <IconCoins size={20} />}
              label={`${balance < 0 ? "Por cobrar" : "Saldo a favor"}${selectedClient ? ` · ${selectedClient.name}` : ""}`}
              value={money(Math.abs(balance))}
            />
            <KpiCard
              tone="ok"
              icon={<IconCoins size={20} />}
              label={`Pagos recibidos · ventas ${money(salesTotal)}`}
              value={money(paymentsTotal)}
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
                          inputMode="numeric"
                          value={l.quantity || ""}
                          onChange={(e) =>
                            // Se permite dejarlo vacío mientras se escribe; al salir, mínimo 1.
                            updateLine(l.key, {
                              quantity:
                                e.target.value === ""
                                  ? 0
                                  : Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            })
                          }
                          onBlur={() => {
                            if (!(l.quantity > 0)) updateLine(l.key, { quantity: 1 });
                          }}
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

            <div className="space-y-2 rounded-lg border border-line bg-surface2 p-3">
              <p className="text-sm text-muted">
                Saldo a favor disponible:{" "}
                <span className="nums font-semibold" style={{ color: "var(--ok)" }}>
                  {money(creditAvailable)}
                </span>{" "}
                (se aplica solo). Falta cobrar de esta venta:{" "}
                <span
                  className="nums font-semibold"
                  style={{ color: deliveryDue > 0 ? "var(--danger)" : "var(--ok)" }}
                >
                  {money(deliveryDue)}
                </span>
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Cobrado en la entrega" className="w-40">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={deliveryPaid}
                    placeholder="0.00"
                    onChange={(e) => setDeliveryPaid(e.target.value)}
                    className={cn(inputCls, "nums h-11")}
                  />
                </Field>
                <Field label="Método" className="w-40">
                  <select
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value as PayMethod)}
                    className={cn(inputCls, "h-11")}
                  >
                    {PAY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  variant="secondary"
                  onClick={() => setDeliveryPaid(deliveryDue > 0 ? String(deliveryDue) : "")}
                  disabled={deliveryDue <= 0}
                >
                  Cobrar lo que falta
                </Button>
              </div>
              <p className="text-xs text-muted2">
                Déjalo en 0 si queda a crédito. Si cobras de más, el excedente
                queda como saldo a favor.
              </p>
            </div>

            <Button
              variant="primary"
              className="h-12 w-full text-base"
              onClick={() => void saveSale()}
              disabled={saving || lines.length === 0 || !clientId}
            >
              {saving ? "Guardando…" : "Registrar venta"}
            </Button>
          </Card>

          {/* Pagos y anticipos */}
          <Card className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted2">
              Registrar pago o anticipo
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Monto" className="w-36">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={pAmount}
                  placeholder="0.00"
                  onChange={(e) => setPAmount(e.target.value)}
                  className={cn(inputCls, "nums h-11")}
                />
              </Field>
              <Field label="Fecha" className="w-44">
                <input
                  type="date"
                  value={pDate}
                  max={todayYmd()}
                  onChange={(e) => setPDate(e.target.value)}
                  className={cn(inputCls, "input-date-dark h-11")}
                />
              </Field>
              <Field label="Método" className="w-40">
                <select
                  value={pMethod}
                  onChange={(e) => setPMethod(e.target.value as PayMethod)}
                  className={cn(inputCls, "h-11")}
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Aplicar a" className="min-w-[14rem] flex-1">
                <select
                  value={pSaleId}
                  onChange={(e) => setPSaleId(e.target.value)}
                  className={cn(inputCls, "h-11")}
                >
                  <option value="">Saldo general (anticipo)</option>
                  {pendingSales.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      Venta {ps.sold_at} · {money(ps.total)} · debe{" "}
                      {money(round2(ps.total - ps.amount_paid))}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notas (opcional)" className="min-w-[10rem] flex-1">
                <input
                  value={pNotes}
                  onChange={(e) => setPNotes(e.target.value)}
                  placeholder="Ej. transferencia BBVA"
                  className={cn(inputCls, "h-11")}
                />
              </Field>
              <Button
                variant="primary"
                onClick={() => void savePayment()}
                disabled={saving || !clientId || !(Number(pAmount) > 0)}
              >
                Registrar pago
              </Button>
            </div>
            <p className="text-xs text-muted2">
              Un pago al saldo general se aplica automáticamente a las ventas
              pendientes más antiguas; lo que sobre queda como saldo a favor para
              las siguientes entregas.
            </p>

            {payments.length === 0 ? (
              <p className="text-sm text-muted">Sin pagos registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm text-rondaCream">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-muted2">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 text-right font-medium">Monto</th>
                      <th className="px-3 py-2 font-medium">Método</th>
                      <th className="px-3 py-2 font-medium">Aplicado a</th>
                      <th className="px-3 py-2 font-medium">Notas</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => {
                      const linked = pay.sale_id ? salesById.get(pay.sale_id) : null;
                      return (
                        <tr key={pay.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">{pay.paid_at}</td>
                          <td className="nums px-3 py-2 text-right font-semibold">
                            {money(pay.amount)}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {methodLabel(pay.method)}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {linked
                              ? `Venta ${linked.sold_at}${linked.merma ? " (merma → saldo)" : ""}`
                              : "Saldo general"}
                          </td>
                          <td className="px-3 py-2 text-muted2">{pay.notes ?? ""}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void deletePayment(pay)}
                              className="text-xs text-red-400 hover:underline"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Historial / cobranza */}
          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted2">
                Entregas {selectedClient ? `· ${selectedClient.name}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                Cobrar con
                <select
                  value={cobroMethod}
                  onChange={(e) => setCobroMethod(e.target.value as PayMethod)}
                  className={cn(inputCls, "h-8 w-36 py-0 text-xs")}
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
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
                            ) : s.merma ? (
                              <button
                                type="button"
                                onClick={() => void reopen(s)}
                                className="h-9 rounded-lg border border-line px-2 text-xs font-semibold text-muted hover:bg-surface3"
                              >
                                Quitar merma
                              </button>
                            ) : (
                              <span className="text-xs text-muted2">
                                Pagada · para corregir, elimina el pago
                              </span>
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
