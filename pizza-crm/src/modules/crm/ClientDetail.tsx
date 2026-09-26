"use client";

import { useEffect, useMemo, useState } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { Button, Field, Segmented, cn, inputCls, IconX } from "@/components/ui";
import {
  SIZE_KEYS,
  SIZE_LABELS_ES,
  STANDARD_PRODUCT_SIZE,
  type SizeKey,
} from "@/modules/menu/constants";

import {
  ACTIVITY_TYPES,
  BUSINESS_TYPES,
  PAY_METHODS,
  SOURCES,
  STATUSES,
  activityLabel,
  methodLabel,
  money,
  round2,
  statusMeta,
  todayYmd,
  addDaysYmd,
  type Activity,
  type ActivityType,
  type ClientStatus,
  type CrmClientRow,
  type PayMethod,
  type PaymentLite,
  type ProductLite,
  type SaleLite,
  type Staff,
} from "./types";

type Tab = "datos" | "bitacora" | "venta" | "pago";

type Props = {
  supabase: SupabaseClient;
  client: CrmClientRow | null; // null = nuevo prospecto
  sales: SaleLite[];
  payments: PaymentLite[];
  staff: Staff[];
  products: ProductLite[];
  currentUserId: string | null;
  initialTab?: Tab;
  onClose: () => void;
  onChanged: (clientId?: string) => Promise<void>;
};

type DraftLine = {
  key: string;
  productId: string;
  size: SizeKey;
  quantity: number;
  unitPrice: string;
};

const emptyForm = {
  name: "",
  contact: "",
  phone: "",
  status: "prospecto" as ClientStatus,
  business_type: "",
  source: "",
  agreed_price: "",
  expected_weekly_qty: "",
  next_follow_up: "",
  assigned_to: "",
  lost_reason: "",
  notes: "",
};

export default function ClientDetail({
  supabase,
  client,
  sales,
  payments,
  staff,
  products,
  currentUserId,
  initialTab = "datos",
  onClose,
  onChanged,
}: Props) {
  const isNew = client === null;
  const [tab, setTab] = useState<Tab>(isNew ? "datos" : initialTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---------- Datos ----------
  const [form, setForm] = useState(() =>
    client
      ? {
          name: client.name,
          contact: client.contact ?? "",
          phone: client.phone ?? "",
          status: client.status,
          business_type: client.business_type ?? "",
          source: client.source ?? "",
          agreed_price: client.agreed_price != null ? String(client.agreed_price) : "",
          expected_weekly_qty:
            client.expected_weekly_qty != null ? String(client.expected_weekly_qty) : "",
          next_follow_up: client.next_follow_up ?? "",
          assigned_to: client.assigned_to ?? "",
          lost_reason: client.lost_reason ?? "",
          notes: client.notes ?? "",
        }
      : { ...emptyForm, assigned_to: currentUserId ?? "" },
  );
  const setF = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function saveDatos() {
    setError(null);
    setNotice(null);
    if (!form.name.trim()) {
      setError("El nombre del negocio es obligatorio.");
      return;
    }
    if (form.status === "perdido" && !form.lost_reason.trim()) {
      setError("Indica el motivo por el que se perdió.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      phone: form.phone.trim() || null,
      status: form.status,
      business_type: form.business_type || null,
      source: form.source || null,
      agreed_price: form.agreed_price === "" ? null : round2(Number(form.agreed_price)),
      expected_weekly_qty:
        form.expected_weekly_qty === "" ? null : Math.max(0, Math.round(Number(form.expected_weekly_qty))),
      next_follow_up: form.next_follow_up || null,
      assigned_to: form.assigned_to || null,
      lost_reason: form.status === "perdido" ? form.lost_reason.trim() || null : null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    if (isNew) {
      const { data, error: insErr } = await supabase
        .from("wholesale_clients")
        .insert(payload)
        .select("id")
        .single();
      setSaving(false);
      if (insErr) {
        setError(insErr.code === "23505" ? "Ya existe un cliente con ese nombre." : insErr.message);
        return;
      }
      await onChanged((data as { id: string }).id);
      return;
    }
    const { error: upErr } = await supabase
      .from("wholesale_clients")
      .update(payload)
      .eq("id", client.id);
    setSaving(false);
    if (upErr) {
      setError(upErr.code === "23505" ? "Ya existe un cliente con ese nombre." : upErr.message);
      return;
    }
    setNotice("Datos guardados.");
    await onChanged(client.id);
  }

  // ---------- Bitácora ----------
  const [activities, setActivities] = useState<Activity[]>([]);
  const [aType, setAType] = useState<ActivityType>("visita");
  const [aDate, setADate] = useState(todayYmd());
  const [aResult, setAResult] = useState("");
  const [aNext, setANext] = useState("");
  const [aFollow, setAFollow] = useState(addDaysYmd(todayYmd(), 3));

  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  useEffect(() => {
    if (!client) return;
    void (async () => {
      const { data } = await supabase
        .from("crm_activities")
        .select("id,client_id,type,happened_at,result,next_step,next_follow_up,created_by")
        .eq("client_id", client.id)
        .order("happened_at", { ascending: false })
        .order("created_at", { ascending: false });
      setActivities((data ?? []) as Activity[]);
    })();
  }, [supabase, client]);

  async function saveActivity() {
    if (!client) return;
    setError(null);
    setNotice(null);
    if (!currentUserId) {
      setError("Sesión no válida. Vuelve a entrar.");
      return;
    }
    setSaving(true);
    const { error: insErr } = await supabase.from("crm_activities").insert({
      client_id: client.id,
      type: aType,
      happened_at: aDate,
      result: aResult.trim() || null,
      next_step: aNext.trim() || null,
      next_follow_up: aFollow || null,
      created_by: currentUserId,
    });
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setAResult("");
    setANext("");
    setAFollow(addDaysYmd(todayYmd(), 3));
    setNotice("Actividad registrada.");
    const { data } = await supabase
      .from("crm_activities")
      .select("id,client_id,type,happened_at,result,next_step,next_follow_up,created_by")
      .eq("client_id", client.id)
      .order("happened_at", { ascending: false })
      .order("created_at", { ascending: false });
    setActivities((data ?? []) as Activity[]);
    await onChanged(client.id);
  }

  // ---------- Saldo ----------
  const clientSales = useMemo(
    () =>
      client
        ? sales
            .filter((s) => s.client_id === client.id)
            .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
        : [],
    [sales, client],
  );
  const clientPayments = useMemo(
    () =>
      client
        ? payments
            .filter((p) => p.client_id === client.id)
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        : [],
    [payments, client],
  );
  const balance = useMemo(() => {
    const paid = clientPayments.reduce((a, p) => a + p.amount, 0);
    const sold = clientSales.filter((s) => !s.merma).reduce((a, s) => a + s.total, 0);
    return round2(paid - sold);
  }, [clientPayments, clientSales]);
  const creditAvailable = Math.max(0, balance);
  const pendingSales = useMemo(
    () =>
      clientSales
        .filter((s) => !s.merma && s.total - s.amount_paid > 0.001)
        .sort((a, b) => a.sold_at.localeCompare(b.sold_at)),
    [clientSales],
  );

  // ---------- Venta ----------
  const defaultPrice = client?.agreed_price != null ? String(client.agreed_price) : "";
  const newLine = (): DraftLine => ({
    key: crypto.randomUUID(),
    productId: products[0]?.id ?? "",
    size: "medium",
    quantity: client?.expected_weekly_qty && client.expected_weekly_qty > 0 ? client.expected_weekly_qty : 1,
    unitPrice: defaultPrice,
  });
  const [lines, setLines] = useState<DraftLine[]>(() => (products.length ? [newLine()] : []));
  const [sDate, setSDate] = useState(todayYmd());
  const [sNotes, setSNotes] = useState("");
  const [sPaid, setSPaid] = useState("");
  const [sMethod, setSMethod] = useState<PayMethod>("efectivo");
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const draftTotal = round2(lines.reduce((a, l) => a + (Number(l.unitPrice) || 0) * l.quantity, 0));
  const due = round2(Math.max(0, draftTotal - creditAvailable));

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function saveSale() {
    if (!client) return;
    setError(null);
    setNotice(null);
    const valid = lines.filter((l) => l.productId && l.quantity > 0 && Number(l.unitPrice) >= 0 && l.unitPrice !== "");
    if (valid.length === 0) {
      setError("Agrega al menos un producto con cantidad y precio.");
      return;
    }
    const items = valid.map((l) => {
      const hasSizes = productsById.get(l.productId)?.has_sizes !== false;
      return {
        product_id: l.productId,
        size: hasSizes ? l.size : STANDARD_PRODUCT_SIZE,
        quantity: l.quantity,
        unit_price: Number(l.unitPrice) || 0,
      };
    });
    const paid = round2(Number(sPaid) || 0);
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc("create_wholesale_sale", {
      p_client_id: client.id,
      p_sold_at: sDate,
      p_items: items,
      p_notes: sNotes.trim() || null,
      p_paid_amount: paid,
      p_method: sMethod,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setNotice(
      `Venta de ${money(draftTotal)} registrada (descontada de inventario)${paid > 0 ? ` · cobrado ${money(paid)}` : ""}.`,
    );
    setLines(products.length ? [newLine()] : []);
    setSNotes("");
    setSPaid("");
    setSDate(todayYmd());
    await onChanged(client.id);
  }

  // ---------- Pago ----------
  const [pAmount, setPAmount] = useState("");
  const [pDate, setPDate] = useState(todayYmd());
  const [pMethod, setPMethod] = useState<PayMethod>("transferencia");
  const [pSale, setPSale] = useState("");
  const [pNotes, setPNotes] = useState("");

  async function savePayment() {
    if (!client) return;
    setError(null);
    setNotice(null);
    const amt = round2(Number(pAmount));
    if (!(amt > 0)) {
      setError("Ingresa un monto válido.");
      return;
    }
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc("add_wholesale_payment", {
      p_client_id: client.id,
      p_amount: amt,
      p_paid_at: pDate,
      p_method: pMethod,
      p_sale_id: pSale || null,
      p_notes: pNotes.trim() || null,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setNotice(pSale ? `Pago de ${money(amt)} aplicado a la venta.` : `Anticipo de ${money(amt)} registrado.`);
    setPAmount("");
    setPNotes("");
    setPSale("");
    setPDate(todayYmd());
    await onChanged(client.id);
  }

  const st = statusMeta(form.status);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col rounded-t-3xl border border-line bg-surface shadow-card sm:rounded-3xl">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-rondaCream">
              {isNew ? "Nuevo prospecto" : client.name}
            </h3>
            {!isNew ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ color: st.color, border: `1px solid ${st.color}` }}
                >
                  {st.label}
                </span>
                <span className="text-muted">
                  {balance < -0.001 ? "Debe " : balance > 0.001 ? "Saldo a favor " : "Saldo "}
                  <span
                    className="nums font-semibold"
                    style={{
                      color: balance < -0.001 ? "var(--danger)" : balance > 0.001 ? "var(--ok)" : undefined,
                    }}
                  >
                    {money(Math.abs(balance))}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg border border-line p-2 text-muted hover:bg-surface2"
            aria-label="Cerrar"
          >
            <IconX size={16} />
          </button>
        </div>

        {!isNew ? (
          <div className="border-b border-line px-5 py-3">
            <Segmented<Tab>
              options={[
                { key: "datos", label: "Datos" },
                { key: "bitacora", label: "Bitácora" },
                { key: "venta", label: "Venta" },
                { key: "pago", label: "Pago / anticipo" },
              ]}
              value={tab}
              onChange={(t) => {
                setTab(t);
                setError(null);
                setNotice(null);
              }}
            />
          </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="rounded-xl p-3 text-sm" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
              {notice}
            </div>
          ) : null}

          {/* ---------------- DATOS ---------------- */}
          {tab === "datos" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Negocio *">
                  <input value={form.name} onChange={(e) => setF({ name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Estatus">
                  <select
                    value={form.status}
                    onChange={(e) => setF({ status: e.target.value as ClientStatus })}
                    className={inputCls}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Contacto">
                  <input
                    value={form.contact}
                    onChange={(e) => setF({ contact: e.target.value })}
                    placeholder="Ej. Sra. Martínez"
                    className={inputCls}
                  />
                </Field>
                <Field label="Teléfono / WhatsApp">
                  <input
                    value={form.phone}
                    onChange={(e) => setF({ phone: e.target.value })}
                    inputMode="tel"
                    className={inputCls}
                  />
                </Field>
                <Field label="Tipo de negocio">
                  <select
                    value={form.business_type}
                    onChange={(e) => setF({ business_type: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {BUSINESS_TYPES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cómo llegó">
                  <select value={form.source} onChange={(e) => setF({ source: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {SOURCES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Precio acordado por pizza">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.agreed_price}
                    onChange={(e) => setF({ agreed_price: e.target.value })}
                    placeholder="85.00"
                    className={cn(inputCls, "nums")}
                  />
                </Field>
                <Field label="Pizzas por semana (esperadas)">
                  <input
                    type="number"
                    min={0}
                    value={form.expected_weekly_qty}
                    onChange={(e) => setF({ expected_weekly_qty: e.target.value })}
                    className={cn(inputCls, "nums")}
                  />
                </Field>
                <Field label="Responsable">
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setF({ assigned_to: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Sin asignar</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Próximo seguimiento">
                  <input
                    type="date"
                    value={form.next_follow_up}
                    onChange={(e) => setF({ next_follow_up: e.target.value })}
                    className={cn(inputCls, "input-date-dark")}
                  />
                </Field>
              </div>
              {form.status === "perdido" ? (
                <Field label="Motivo de pérdida *">
                  <input
                    value={form.lost_reason}
                    onChange={(e) => setF({ lost_reason: e.target.value })}
                    placeholder="Ej. precio, ya tiene proveedor, no le gustó"
                    className={inputCls}
                  />
                </Field>
              ) : null}
              <Field label="Notas">
                <textarea
                  value={form.notes}
                  onChange={(e) => setF({ notes: e.target.value })}
                  rows={3}
                  className={cn(inputCls, "h-auto py-2")}
                />
              </Field>
              <Button variant="primary" className="w-full" onClick={() => void saveDatos()} disabled={saving}>
                {saving ? "Guardando…" : isNew ? "Dar de alta" : "Guardar datos"}
              </Button>
            </div>
          ) : null}

          {/* ---------------- BITÁCORA ---------------- */}
          {tab === "bitacora" && client ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-line bg-surface2 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Tipo">
                    <select value={aType} onChange={(e) => setAType(e.target.value as ActivityType)} className={inputCls}>
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fecha">
                    <input
                      type="date"
                      value={aDate}
                      max={todayYmd()}
                      onChange={(e) => setADate(e.target.value)}
                      className={cn(inputCls, "input-date-dark")}
                    />
                  </Field>
                  <Field label="Próximo seguimiento">
                    <input
                      type="date"
                      value={aFollow}
                      onChange={(e) => setAFollow(e.target.value)}
                      className={cn(inputCls, "input-date-dark")}
                    />
                  </Field>
                </div>
                <Field label="¿Qué pasó?">
                  <input
                    value={aResult}
                    onChange={(e) => setAResult(e.target.value)}
                    placeholder="Ej. Le gustó la de pepperoni, pide precio por 30"
                    className={inputCls}
                  />
                </Field>
                <Field label="Siguiente paso">
                  <input
                    value={aNext}
                    onChange={(e) => setANext(e.target.value)}
                    placeholder="Ej. Llevar muestra de margarita"
                    className={inputCls}
                  />
                </Field>
                <p className="text-xs text-muted2">
                  Al guardar, el próximo seguimiento del cliente se actualiza (vacío = sin seguimiento). Una visita,
                  llamada o WhatsApp pasa a un prospecto a &quot;Contactado&quot;; una muestra lo pasa a &quot;Muestra&quot;.
                </p>
                <Button variant="primary" className="w-full" onClick={() => void saveActivity()} disabled={saving}>
                  {saving ? "Guardando…" : "Registrar actividad"}
                </Button>
              </div>

              {activities.length === 0 ? (
                <p className="text-center text-sm text-muted">Sin actividades registradas.</p>
              ) : (
                <ol className="space-y-2">
                  {activities.map((a) => (
                    <li key={a.id} className="rounded-xl border border-line bg-surface2 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-rondaCream">
                          {activityLabel(a.type)} · {a.happened_at}
                        </span>
                        <span className="text-xs text-muted2">
                          {a.created_by ? staffName.get(a.created_by) ?? "" : ""}
                        </span>
                      </div>
                      {a.result ? <p className="mt-1 text-muted">{a.result}</p> : null}
                      {a.next_step ? (
                        <p className="mt-1 text-xs text-muted2">
                          Siguiente: {a.next_step}
                          {a.next_follow_up ? ` · ${a.next_follow_up}` : ""}
                        </p>
                      ) : a.next_follow_up ? (
                        <p className="mt-1 text-xs text-muted2">Seguimiento: {a.next_follow_up}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {/* ---------------- VENTA ---------------- */}
          {tab === "venta" && client ? (
            <div className="space-y-4">
              {products.length === 0 ? (
                <p className="rounded-lg p-3 text-sm" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                  No hay productos de mayoreo dados de alta.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    <Field label="Fecha" className="w-44">
                      <input
                        type="date"
                        value={sDate}
                        max={todayYmd()}
                        onChange={(e) => setSDate(e.target.value)}
                        className={cn(inputCls, "input-date-dark")}
                      />
                    </Field>
                    <Field label="Notas (opcional)" className="min-w-[12rem] flex-1">
                      <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                  <div className="space-y-2">
                    {lines.map((l) => {
                      const hasSizes = productsById.get(l.productId)?.has_sizes !== false;
                      return (
                        <div key={l.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface2 p-2">
                          <div className="min-w-[10rem] flex-1">
                            <label className="mb-1 block text-xs text-muted2">Pizza</label>
                            <select
                              value={l.productId}
                              onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                              className={cn(inputCls, "h-10")}
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="w-28">
                            <label className="mb-1 block text-xs text-muted2">Tamaño</label>
                            <select
                              value={l.size}
                              disabled={!hasSizes}
                              onChange={(e) => updateLine(l.key, { size: e.target.value as SizeKey })}
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
                            <label className="mb-1 block text-xs text-muted2">Cant.</label>
                            <input
                              type="number"
                              min={1}
                              value={l.quantity}
                              onChange={(e) => updateLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                              className={cn(inputCls, "nums h-10")}
                            />
                          </div>
                          <div className="w-28">
                            <label className="mb-1 block text-xs text-muted2">Precio unit.</label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={l.unitPrice}
                              placeholder="0.00"
                              onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                              className={cn(inputCls, "nums h-10")}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                            className="mb-1 rounded-md border border-line px-2 py-2 text-xs text-muted hover:bg-surface3"
                          >
                            Quitar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button variant="secondary" onClick={() => setLines((prev) => [...prev, newLine()])}>
                      + Agregar producto
                    </Button>
                    <div className="text-right">
                      <p className="text-xs text-muted2">Total</p>
                      <p className="nums text-2xl font-black text-rondaCream">{money(draftTotal)}</p>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-line bg-surface2 p-3">
                    <p className="text-sm text-muted">
                      Saldo a favor: <span className="nums font-semibold" style={{ color: "var(--ok)" }}>{money(creditAvailable)}</span>{" "}
                      (se aplica solo) · Falta cobrar:{" "}
                      <span className="nums font-semibold" style={{ color: due > 0 ? "var(--danger)" : "var(--ok)" }}>
                        {money(due)}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Cobrado en la entrega" className="w-40">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={sPaid}
                          placeholder="0.00"
                          onChange={(e) => setSPaid(e.target.value)}
                          className={cn(inputCls, "nums")}
                        />
                      </Field>
                      <Field label="Método" className="w-40">
                        <select value={sMethod} onChange={(e) => setSMethod(e.target.value as PayMethod)} className={inputCls}>
                          {PAY_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Button variant="secondary" onClick={() => setSPaid(due > 0 ? String(due) : "")} disabled={due <= 0}>
                        Cobrar lo que falta
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    className="h-12 w-full"
                    onClick={() => void saveSale()}
                    disabled={saving || lines.length === 0}
                  >
                    {saving ? "Guardando…" : "Registrar venta"}
                  </Button>
                </>
              )}

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted2">Ventas recientes</p>
                {clientSales.length === 0 ? (
                  <p className="text-sm text-muted">Sin ventas.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {clientSales.slice(0, 10).map((s) => {
                      const saldo = round2(s.total - s.amount_paid);
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span>{s.sold_at}</span>
                          <span className="nums font-semibold">{money(s.total)}</span>
                          <span
                            className="text-xs font-bold"
                            style={{
                              color: s.merma ? "var(--warn)" : saldo > 0.001 ? "var(--danger)" : "var(--ok)",
                            }}
                          >
                            {s.merma ? "Merma" : saldo > 0.001 ? `Debe ${money(saldo)}` : "Pagada"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {/* ---------------- PAGO ---------------- */}
          {tab === "pago" && client ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Monto">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={pAmount}
                    placeholder="0.00"
                    onChange={(e) => setPAmount(e.target.value)}
                    className={cn(inputCls, "nums")}
                  />
                </Field>
                <Field label="Fecha">
                  <input
                    type="date"
                    value={pDate}
                    max={todayYmd()}
                    onChange={(e) => setPDate(e.target.value)}
                    className={cn(inputCls, "input-date-dark")}
                  />
                </Field>
                <Field label="Método">
                  <select value={pMethod} onChange={(e) => setPMethod(e.target.value as PayMethod)} className={inputCls}>
                    {PAY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Aplicar a">
                  <select value={pSale} onChange={(e) => setPSale(e.target.value)} className={inputCls}>
                    <option value="">Saldo general (anticipo)</option>
                    {pendingSales.map((s) => (
                      <option key={s.id} value={s.id}>
                        Venta {s.sold_at} · debe {money(round2(s.total - s.amount_paid))}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Notas (opcional)">
                <input value={pNotes} onChange={(e) => setPNotes(e.target.value)} className={inputCls} />
              </Field>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => void savePayment()}
                disabled={saving || !(Number(pAmount) > 0)}
              >
                {saving ? "Guardando…" : "Registrar pago"}
              </Button>
              <p className="text-xs text-muted2">
                Un anticipo se aplica solo a las ventas pendientes más antiguas; lo que sobre queda como saldo a favor.
                Para corregir o eliminar un pago, pídeselo al administrador.
              </p>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted2">Pagos</p>
                {clientPayments.length === 0 ? (
                  <p className="text-sm text-muted">Sin pagos.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {clientPayments.slice(0, 15).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>{p.paid_at}</span>
                        <span className="nums font-semibold">{money(p.amount)}</span>
                        <span className="text-xs text-muted">
                          {methodLabel(p.method)} · {p.sale_id ? "a venta" : "saldo general"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

