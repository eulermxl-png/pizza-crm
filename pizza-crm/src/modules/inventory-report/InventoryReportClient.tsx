"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  STOCK_STATUS_META,
  baseUnitLabel,
  purchaseUnitsFor,
  stockStatus,
  type StockStatus,
} from "@/modules/inventory/types";
import {
  rangeForPreset,
  type LocalDateRange,
} from "@/modules/expenses/lib/dateRange";
import type { ExpensePeriodPreset } from "@/modules/expenses/types";
import {
  Button,
  Card,
  Field,
  KpiCard,
  Modal,
  Progress,
  Section,
  Segmented,
  StatusBadge,
  cn,
  inputCls,
  selectCls,
  type Tone,
  IconAlert,
  IconCart,
  IconCheck,
  IconCoins,
  IconCopy,
  IconPercent,
  IconRotate,
  IconSliders,
  IconTrash,
} from "@/components/ui";

type Material = {
  id: string;
  name: string;
  category: string;
  base_unit: string | null;
  min_stock: number | null;
  current_stock: number | null;
  current_cost: number | null;
};

type WasteRow = {
  id: string;
  qty_base: number;
  unit_cost_base: number;
  reason: string | null;
  created_at: string;
  item_name: string;
};

const WASTE_REASONS = [
  "Echado a perder",
  "Caducidad",
  "Prueba / Capacitación",
  "Cortesía",
  "Recorte / Preparación",
  "Otro",
];

const PRESETS: { key: Exclude<ExpensePeriodPreset, "custom">; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "prevMonth", label: "Mes anterior" },
];

const STATUS_TONE: Record<StockStatus, "ok" | "warn" | "danger"> = {
  ok: "ok",
  low: "warn",
  out: "danger",
};

// Umbrales de food cost (ajustables). <= OK verde, <= WARN ámbar, > WARN rojo.
const FOOD_COST_OK = 32;
const FOOD_COST_WARN = 38;

const money = (n: number) =>
  n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qtyFmt = (n: number) =>
  Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 });

export default function InventoryReportClient() {
  const supabase = useMemo(() => createClient(), []);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [waste, setWaste] = useState<WasteRow[]>([]);
  const [cogs, setCogs] = useState(0); // costo de consumo del período (kardex)
  const [revenue, setRevenue] = useState(0); // ingresos delivered del período
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const [copied, setCopied] = useState(false);

  const [preset, setPreset] =
    useState<Exclude<ExpensePeriodPreset, "custom">>("month");
  const range: LocalDateRange = useMemo(() => rangeForPreset(preset), [preset]);

  // Registrar merma
  const [showWaste, setShowWaste] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wItem, setWItem] = useState("");
  const [wQty, setWQty] = useState("");
  const [wUnit, setWUnit] = useState("");
  const [wReason, setWReason] = useState(WASTE_REASONS[0]);

  const loadMaterials = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("inventory_items")
      .select("id,name,category,base_unit,min_stock,current_stock,current_cost")
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (e) setError(e.message);
    else setMaterials((data ?? []) as Material[]);
  }, [supabase]);

  const loadWaste = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("inventory_movements")
      .select("id,qty_base,unit_cost_base,reason,created_at,inventory_items(name)")
      .eq("type", "waste")
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`)
      .order("created_at", { ascending: false });
    if (e) {
      setError(e.message);
      return;
    }
    setWaste(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        qty_base: Number(r.qty_base),
        unit_cost_base: Number(r.unit_cost_base),
        reason: (r.reason as string | null) ?? null,
        created_at: r.created_at as string,
        item_name:
          ((r.inventory_items as { name?: string } | null)?.name ?? "—") as string,
      })),
    );
  }, [supabase, range.from, range.to]);

  const loadFinance = useCallback(async () => {
    // COGS del período = consumo real registrado en el kardex
    const { data: cons } = await supabase
      .from("inventory_movements")
      .select("qty_base,unit_cost_base")
      .eq("type", "consumption")
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`);
    const cogsSum = (cons ?? []).reduce(
      (s, r: Record<string, unknown>) =>
        s + Math.abs(Number(r.qty_base) * Number(r.unit_cost_base)),
      0,
    );
    // Ingresos del período = órdenes entregadas
    const { data: ord } = await supabase
      .from("orders")
      .select("total")
      .eq("status", "delivered")
      .gte("created_at", `${range.from}T00:00:00`)
      .lte("created_at", `${range.to}T23:59:59`);
    const rev = (ord ?? []).reduce(
      (s, r: Record<string, unknown>) => s + Number(r.total ?? 0),
      0,
    );
    setCogs(cogsSum);
    setRevenue(rev);
  }, [supabase, range.from, range.to]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadMaterials(), loadWaste(), loadFinance()]);
      setLoading(false);
    })();
  }, [loadMaterials, loadWaste, loadFinance]);

  const inventoryValue = useMemo(
    () =>
      materials.reduce(
        (s, m) => s + Number(m.current_stock ?? 0) * Number(m.current_cost ?? 0),
        0,
      ),
    [materials],
  );

  const reorder = useMemo(
    () =>
      materials.filter(
        (m) => stockStatus(m.current_stock, m.min_stock) !== "ok",
      ),
    [materials],
  );

  const wasteValue = useMemo(
    () => waste.reduce((s, w) => s + Math.abs(w.qty_base * w.unit_cost_base), 0),
    [waste],
  );

  const shown = useMemo(
    () =>
      onlyLow
        ? materials.filter(
            (m) => stockStatus(m.current_stock, m.min_stock) !== "ok",
          )
        : materials,
    [materials, onlyLow],
  );

  const daysInPeriod = useMemo(() => {
    const a = new Date(`${range.from}T00:00:00`);
    const b = new Date(`${range.to}T00:00:00`);
    const d = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
    return d > 0 ? d : 1;
  }, [range.from, range.to]);

  // Food cost % (real): COGS de consumo / ingresos entregados
  const foodCostPct = revenue > 0 && cogs > 0 ? (cogs / revenue) * 100 : null;
  const foodTone: Tone =
    foodCostPct === null
      ? "teal"
      : foodCostPct <= FOOD_COST_OK
        ? "ok"
        : foodCostPct <= FOOD_COST_WARN
          ? "warn"
          : "danger";

  // Rotación: veces que rota el inventario en el período + días de inventario
  const turnover =
    inventoryValue > 0 && cogs > 0 ? cogs / inventoryValue : null;
  const daysOfInventory =
    cogs > 0 ? inventoryValue / (cogs / daysInPeriod) : null;

  const shoppingList = useMemo(() => {
    if (reorder.length === 0) return "";
    const lines = reorder.map((m) => {
      const u = baseUnitLabel(m.base_unit);
      return `- ${m.name} (quedan ${qtyFmt(Number(m.current_stock ?? 0))} ${u})`;
    });
    return `Lista de compra:\n${lines.join("\n")}`;
  }, [reorder]);

  async function copyShopping() {
    try {
      await navigator.clipboard.writeText(shoppingList);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se pudo copiar. Copia el texto manualmente.");
    }
  }

  const selectedWasteItem = materials.find((m) => m.id === wItem);
  const wUnitOptions = useMemo(
    () =>
      selectedWasteItem
        ? purchaseUnitsFor(selectedWasteItem.base_unit).filter(
            (u) => u.code !== "paquete",
          )
        : [],
    [selectedWasteItem],
  );
  useEffect(() => {
    if (!wUnitOptions.some((u) => u.code === wUnit)) {
      setWUnit(wUnitOptions[0]?.code ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wUnitOptions]);

  function openWaste() {
    setWItem("");
    setWQty("");
    setWReason(WASTE_REASONS[0]);
    setError(null);
    setShowWaste(true);
  }

  async function submitWaste(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!wItem) {
      setError("Elige un material.");
      return;
    }
    const qty = Number(wQty);
    if (!(qty > 0)) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (!wUnit) {
      setError("Elige la unidad.");
      return;
    }
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc("apply_waste", {
      p_item_id: wItem,
      p_qty: qty,
      p_unit: wUnit,
      p_reason: wReason,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setShowWaste(false);
    setOk("Merma registrada.");
    await Promise.all([loadMaterials(), loadWaste(), loadFinance()]);
  }

  const reorderPct =
    materials.length > 0 ? (reorder.length / materials.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {error ? (
        <div
          className="rounded-xl border border-transparent p-3 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div
          className="rounded-xl border border-transparent p-3 text-sm"
          style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
        >
          {ok}
        </div>
      ) : null}

      {/* ---- AHORA (estado actual) ---- */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <KpiCard
          tone="brand"
          icon={<IconCoins size={20} />}
          label="Valor de inventario"
          value={money(inventoryValue)}
          sub={`${materials.length} ${materials.length === 1 ? "material" : "materiales"} activos`}
        />
        <KpiCard
          tone="warn"
          icon={<IconCart size={20} />}
          label="Por reordenar"
          value={String(reorder.length)}
          valueTone={reorder.length > 0 ? "warn" : undefined}
          sub={
            <div className="space-y-1.5">
              <Progress value={reorderPct} tone="warn" />
              <p>
                de {materials.length}{" "}
                {materials.length === 1 ? "material" : "materiales"}
              </p>
            </div>
          }
        />
      </div>

      {/* Callout de reorden */}
      {reorder.length > 0 ? (
        <Card
          className="border-transparent"
          style={{ background: "var(--warn-soft)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span style={{ color: "var(--warn)" }}>
                <IconAlert size={20} />
              </span>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--warn)" }}
              >
                Hay {reorder.length} material(es) por reordenar
              </p>
            </div>
            <Button
              variant="success"
              size="sm"
              onClick={() => void copyShopping()}
              leftIcon={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            >
              {copied ? "¡Copiado!" : "Copiar lista de compra"}
            </Button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 text-xs text-muted">
            {shoppingList}
          </pre>
        </Card>
      ) : null}

      {/* Controles de la tabla de existencia */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOnlyLow((v) => !v)}
          aria-pressed={onlyLow}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors",
            onlyLow
              ? "border-brand bg-brand text-[#241a12]"
              : "border-line bg-surface2 text-muted hover:text-rondaCream",
          )}
        >
          <IconSliders size={16} />
          Solo bajo mínimo
        </button>
        <Button
          variant="dangerSoft"
          onClick={openWaste}
          leftIcon={<IconTrash size={16} />}
        >
          Registrar merma
        </Button>
      </div>

      {/* Tabla de existencia */}
      {loading ? (
        <Card className="text-center text-muted">Cargando…</Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm text-rondaCream">
              <thead className="border-b border-line bg-surface2 text-xs uppercase tracking-wide text-muted2">
                <tr>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 text-right font-medium">Existencia</th>
                  <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Costo/u</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      {onlyLow
                        ? "Nada bajo mínimo. Todo en verde."
                        : "Sin materiales activos."}
                    </td>
                  </tr>
                ) : (
                  shown.map((m) => {
                    const st = stockStatus(m.current_stock, m.min_stock);
                    const meta = STOCK_STATUS_META[st];
                    const u = baseUnitLabel(m.base_unit);
                    const val =
                      Number(m.current_stock ?? 0) * Number(m.current_cost ?? 0);
                    return (
                      <tr
                        key={m.id}
                        className="border-b border-line transition-colors last:border-0 hover:bg-surface2"
                      >
                        <td className="px-4 py-3 font-medium">{m.name}</td>
                        <td className="px-4 py-3 text-muted">{m.category}</td>
                        <td className="nums px-4 py-3 text-right">
                          {qtyFmt(Number(m.current_stock ?? 0))}{" "}
                          <span className="text-muted2">{u}</span>
                        </td>
                        <td className="nums px-4 py-3 text-right text-muted2">
                          {qtyFmt(Number(m.min_stock ?? 0))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={STATUS_TONE[st]} label={meta.label} />
                        </td>
                        <td className="nums px-4 py-3 text-right text-muted">
                          {money(Number(m.current_cost ?? 0))}
                        </td>
                        <td className="nums px-4 py-3 text-right font-semibold text-rondaCream">
                          {money(val)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---- DEL PERÍODO (flujo: food cost, rotación, merma) ---- */}
      <Section
        title="Del período"
        action={
          <Segmented
            options={PRESETS}
            value={preset}
            onChange={(k) => setPreset(k)}
          />
        }
      >
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <KpiCard
            tone={foodTone}
            icon={<IconPercent size={20} />}
            label="Food cost %"
            value={foodCostPct === null ? "—" : `${foodCostPct.toFixed(1)}%`}
            valueTone={foodCostPct === null ? undefined : foodTone}
            sub={
              foodCostPct === null
                ? "Sin ventas con consumo aún"
                : `Meta ≤ ${FOOD_COST_OK}% · costo de venta ${money(cogs)}`
            }
          />
          <KpiCard
            tone="teal"
            icon={<IconRotate size={20} />}
            label="Rotación de inventario"
            value={turnover === null ? "—" : `${turnover.toFixed(1)}×`}
            sub={
              daysOfInventory === null
                ? "Sin consumo aún"
                : `≈ ${Math.round(daysOfInventory)} días de inventario`
            }
          />
          <KpiCard
            tone="danger"
            icon={<IconTrash size={20} />}
            label="Merma"
            value={money(wasteValue)}
            valueTone={wasteValue > 0 ? "danger" : undefined}
            sub={`${waste.length} ${waste.length === 1 ? "registro" : "registros"}`}
          />
        </div>

        <Card padded={false} className="overflow-hidden">
          {waste.length === 0 ? (
            <p className="p-6 text-center text-muted">
              Sin merma registrada en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm text-rondaCream">
                <thead className="border-b border-line bg-surface2 text-xs uppercase tracking-wide text-muted2">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Material</th>
                    <th className="px-4 py-3 font-medium">Motivo</th>
                    <th className="px-4 py-3 text-right font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {waste.map((w) => (
                    <tr key={w.id} className="border-b border-line last:border-0">
                      <td className="nums px-4 py-3 text-muted">
                        {w.created_at.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">{w.item_name}</td>
                      <td className="px-4 py-3 text-muted">{w.reason ?? "—"}</td>
                      <td
                        className="nums px-4 py-3 text-right font-semibold"
                        style={{ color: "var(--danger)" }}
                      >
                        {money(Math.abs(w.qty_base * w.unit_cost_base))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      {/* Modal registrar merma */}
      <Modal
        open={showWaste}
        onClose={() => setShowWaste(false)}
        closeDisabled={saving}
        title="Registrar merma"
      >
        <form onSubmit={submitWaste} className="space-y-4">
          <Field label="Material">
            <select
              value={wItem}
              onChange={(e) => setWItem(e.target.value)}
              className={selectCls}
            >
              <option value="">— Elige —</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-3">
            <Field label="Cantidad" className="flex-1">
              <input
                type="number"
                min={0}
                step="any"
                value={wQty}
                onChange={(e) => setWQty(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Unidad" className="w-28">
              <select
                value={wUnit}
                onChange={(e) => setWUnit(e.target.value)}
                disabled={!selectedWasteItem}
                className={cn(selectCls, "px-2 disabled:opacity-50")}
              >
                {wUnitOptions.length === 0 ? <option value="">—</option> : null}
                {wUnitOptions.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Motivo">
            <select
              value={wReason}
              onChange={(e) => setWReason(e.target.value)}
              className={selectCls}
            >
              {WASTE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setShowWaste(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              className="flex-1"
              disabled={saving}
            >
              {saving ? "Guardando…" : "Registrar merma"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
