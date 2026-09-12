"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { sizeChoiceLabelEs } from "@/modules/menu/constants";
import { INCLUDED_IN_COMBO_NOTE } from "../lib/comboItemMetadata";
import {
  mixedAmountsMatchTotal,
  parseMoneyInput,
} from "../lib/cartMath";
import { originRequiresPhone } from "../lib/orderOrigin";
import type {
  CartLine,
  OrderOrigin,
  OrderPaymentMethod,
  OrderTipMode,
} from "../types";

function segmentToggleStyle(active: boolean): CSSProperties {
  const base: CSSProperties = {
    height: "2.75rem",
    flex: 1,
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    cursor: "pointer",
  };
  if (active) {
    return {
      ...base,
      backgroundColor: "#3D1F0F",
      color: "#F5F0E8",
      fontWeight: 700,
      border: "1px solid transparent",
    };
  }
  return {
    ...base,
    backgroundColor: "#1a1a1a",
    color: "#888888",
    fontWeight: 400,
    border: "1px solid #333333",
  };
}

const CONFIRM_DISABLED: CSSProperties = {
  backgroundColor: "#3f3f46",
  color: "#e4e4e7",
  border: "2px solid #71717a",
};

/** Activo = listo para enviar; inactivo = deshabilitado (gris). */
function confirmKitchenButtonStyle(enabled: boolean): CSSProperties {
  const base: CSSProperties = {
    height: "3rem",
    width: "100%",
    borderRadius: "0.5rem",
    fontSize: "1rem",
    cursor: enabled ? "pointer" : "not-allowed",
  };
  if (enabled) {
    return {
      ...base,
      backgroundColor: "#3D1F0F",
      color: "#F5F0E8",
      fontWeight: 700,
      border: "2px solid #2C1810",
      boxSizing: "border-box",
    };
  }
  return {
    ...base,
    ...CONFIRM_DISABLED,
    fontWeight: 600,
    boxSizing: "border-box",
    opacity: 0.95,
  };
}

const DISCOUNT_REASONS = [
  "Empleado",
  "Amigo / Familia",
  "Producto con defecto",
  "Otro",
];

type Props = {
  origin: OrderOrigin;
  onOriginChange: (o: OrderOrigin) => void;
  /** true = para llevar, false = comer aquí. Controla el descuento de empaque. */
  takeout?: boolean;
  onTakeoutChange?: (v: boolean) => void;
  paymentMethod: OrderPaymentMethod;
  onPaymentMethodChange: (p: OrderPaymentMethod) => void;
  mixedCashInput: string;
  mixedCardInput: string;
  onMixedCashInputChange: (v: string) => void;
  onMixedCardInputChange: (v: string) => void;
  /** Solo visual: efectivo recibido (pago total en efectivo). */
  cashTenderInput: string;
  onCashTenderInputChange: (v: string) => void;
  /** Solo visual: efectivo físico entregado en pago mixto. */
  mixedCashTenderInput: string;
  onMixedCashTenderInputChange: (v: string) => void;
  customerName: string;
  customerPhone: string;
  onCustomerNameChange: (v: string) => void;
  onCustomerPhoneChange: (v: string) => void;
  phoneSuggestions: { customer_name: string | null; customer_phone: string }[];
  lines: CartLine[];
  subtotal: number;
  /** Monto del descuento (derivado del %); solo para mostrar. */
  discount: number;
  /** Porcentaje del descuento (fuente de verdad, 0-100). */
  discountPct: number;
  onDiscountPctChange: (pct: number) => void;
  discountReason?: string;
  onDiscountReasonChange?: (v: string) => void;
  /** Total a cobrar (incluye descuento y propina). */
  grandTotal: number;
  tipMode: OrderTipMode;
  tipCustomInput: string;
  onTipModeChange: (m: OrderTipMode) => void;
  onTipCustomInputChange: (v: string) => void;
  tipAmount: number;
  onRemoveLine: (key: string) => void;
  onClearCart: () => void;
  onSubmitOrder: () => void;
  submitting: boolean;
  /** Mesa: enviar a cocina sin registrar pago (se cobra al liberar la mesa). */
  paymentDeferred?: boolean;
  /** Oculta el campo de nombre: la mesa ya tiene etiqueta en `tables.customer_name`. */
  hideCustomerNameField?: boolean;
  confirmButtonLabel?: string;
};

export default function OrderSummaryPanel({
  origin,
  onOriginChange,
  takeout = false,
  onTakeoutChange,
  paymentMethod,
  onPaymentMethodChange,
  mixedCashInput,
  mixedCardInput,
  onMixedCashInputChange,
  onMixedCardInputChange,
  cashTenderInput,
  onCashTenderInputChange,
  mixedCashTenderInput,
  onMixedCashTenderInputChange,
  customerName,
  customerPhone,
  onCustomerNameChange,
  onCustomerPhoneChange,
  phoneSuggestions,
  lines,
  subtotal,
  discount,
  discountPct,
  onDiscountPctChange,
  discountReason = "",
  onDiscountReasonChange,
  onRemoveLine,
  onClearCart,
  onSubmitOrder,
  submitting,
  grandTotal,
  tipMode,
  tipCustomInput,
  onTipModeChange,
  onTipCustomInputChange,
  tipAmount,
  paymentDeferred = false,
  hideCustomerNameField = false,
  confirmButtonLabel = "Confirmar y enviar a cocina",
}: Props) {
  const [pctInput, setPctInput] = useState("");
  useEffect(() => {
    if (discountPct === 0 && pctInput !== "") setPctInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountPct]);
  function applyDiscountPct(p: number) {
    onDiscountPctChange(Math.max(0, Math.min(100, Math.round(p))));
  }

  const mixedCash = parseMoneyInput(mixedCashInput);
  const mixedCard = parseMoneyInput(mixedCardInput);
  const mixedSum = mixedCash + mixedCard;
  const mixedPending = grandTotal - mixedSum;
  /** Immediate-pay orders (not mesa tab): split amounts must match when Mixto. */
  const mixedSplitOk =
    paymentMethod !== "mixed" ||
    mixedAmountsMatchTotal(mixedCash, mixedCard, grandTotal);

  /** Teléfono orders need a phone number before enviar (same rules as submitOrder). */
  const phoneOkForImmediate =
    paymentDeferred ||
    !originRequiresPhone(origin) ||
    customerPhone.trim().length > 0;

  const cashTenderEntered = cashTenderInput.trim() !== "";
  const cashTender = parseMoneyInput(cashTenderInput);
  const cashChange =
    cashTenderEntered && cashTender >= grandTotal
      ? cashTender - grandTotal
      : null;
  const cashInsufficient =
    paymentMethod === "cash" &&
    cashTenderEntered &&
    cashTender < grandTotal &&
    grandTotal > 0;

  const mixedTenderEntered = mixedCashTenderInput.trim() !== "";
  const mixedCashTender = parseMoneyInput(mixedCashTenderInput);
  const mixedCashChange =
    paymentMethod === "mixed" &&
    mixedTenderEntered &&
    mixedCashTender > mixedCash
      ? mixedCashTender - mixedCash
      : null;

  const canSubmitToKitchen =
    lines.length > 0 &&
    !submitting &&
    phoneOkForImmediate &&
    (paymentDeferred || mixedSplitOk);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (lines.length === 0 && !submitting) {
      setPaymentModalOpen(false);
    }
  }, [lines.length, submitting]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      {/* Scroll: origen, nombre de orden y líneas; cobro en modal */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain border-b border-line">
        <div className="space-y-3 pb-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
            Origen del pedido
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOriginChange("walk_in")}
              style={segmentToggleStyle(origin === "walk_in")}
            >
              Mostrador
            </button>
            <button
              type="button"
              onClick={() => onOriginChange("phone")}
              style={segmentToggleStyle(origin === "phone")}
            >
              Teléfono
            </button>
            <button
              type="button"
              onClick={() => onOriginChange("delivery_app")}
              style={segmentToggleStyle(origin === "delivery_app")}
            >
              DIDI/Uber
            </button>
            <button
              type="button"
              onClick={() => onOriginChange("goat")}
              style={segmentToggleStyle(origin === "goat")}
            >
              Goat
            </button>
            <button
              type="button"
              onClick={() => onOriginChange("padel")}
              style={segmentToggleStyle(origin === "padel")}
            >
              Padel
            </button>
          </div>

          {onTakeoutChange ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
                Servicio (empaque)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onTakeoutChange(false)}
                  style={segmentToggleStyle(!takeout)}
                >
                  Comer aquí
                </button>
                <button
                  type="button"
                  onClick={() => onTakeoutChange(true)}
                  style={segmentToggleStyle(takeout)}
                >
                  Para llevar
                </button>
              </div>
            </div>
          ) : null}

          {originRequiresPhone(origin) ? (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Teléfono
                </label>
                <input
                  value={customerPhone}
                  onChange={(e) => onCustomerPhoneChange(e.target.value)}
                  list="cashier-phone-nums"
                  className="h-11 w-full rounded-lg border border-line bg-surface2 px-3 text-sm text-rondaCream"
                  placeholder="Teléfono"
                  inputMode="tel"
                />
              </div>
              <datalist id="cashier-phone-nums">
                {phoneSuggestions.map((s) => (
                  <option
                    key={`p-${s.customer_phone}`}
                    value={s.customer_phone}
                  />
                ))}
              </datalist>
            </div>
          ) : null}

          {!hideCustomerNameField ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted2">
                Nombre de la orden (opcional)
              </label>
              <input
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                list={
                  originRequiresPhone(origin)
                    ? "cashier-phone-names-origin"
                    : undefined
                }
                placeholder="Ej: Mesa 3, Juan, Para llevar..."
                style={{
                  width: "100%",
                  padding: "8px",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  color: "white",
                  marginBottom: "8px",
                }}
                autoComplete="off"
              />
              {originRequiresPhone(origin) ? (
                <datalist id="cashier-phone-names-origin">
                  {phoneSuggestions.map((s) => (
                    <option
                      key={`ord-${s.customer_phone}`}
                      value={s.customer_name ?? ""}
                    />
                  ))}
                </datalist>
              ) : null}
            </div>
          ) : null}

          {paymentDeferred ? (
            <div className="rounded-lg border border-line bg-surface2 px-3 py-3 text-sm text-muted">
              Cuenta de mesa: el pago se registra al usar{" "}
              <strong className="text-rondaCream">Cobrar mesa</strong> en la
              pantalla Mesas. Este envío solo añade consumo a la cuenta y lo
              manda a cocina.
            </div>
          ) : null}
        </div>

        <div className="border-t border-line py-3">
          <p className="mb-2 text-sm font-bold text-rondaCream">Pedido actual</p>
          {lines.length === 0 ? (
            <p className="text-sm text-muted2">Toca un producto para añadirlo.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.key}
                  className="rounded-lg border border-line bg-surface p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-rondaCream">
                        {line.isComboComponent ? "└ " : ""}
                        {line.quantity}× {line.productName}
                      </p>
                      {!line.isComboComponent ? (
                        <p className="text-xs text-muted2">
                          {sizeChoiceLabelEs(line.size)} · $
                          {line.unitPrice.toFixed(2)} c/u
                        </p>
                      ) : (
                        <p className="text-xs text-muted2">
                          {INCLUDED_IN_COMBO_NOTE}
                        </p>
                      )}
                      {line.customizationNames.length > 0 ? (
                        <p className="mt-1 text-xs text-muted">
                          {line.customizationNames.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-rondaCream">
                        ${(line.unitPrice * line.quantity).toFixed(2)}
                      </p>
                      <button
                        type="button"
                        onClick={() => onRemoveLine(line.key)}
                        className="mt-1 text-xs text-red-400 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 space-y-3 bg-surface3 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]">
        <div className="flex justify-between text-sm text-muted">
          <span>Subtotal</span>
          <span className="font-semibold tabular-nums text-rondaCream">
            ${subtotal.toFixed(2)}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted">Descuento (% del pedido)</label>
            {discountPct > 0 ? (
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: "var(--danger)" }}
              >
                {discountPct}% · −${discount.toFixed(2)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[10, 15, 20].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPctInput("");
                  applyDiscountPct(p);
                }}
                style={segmentToggleStyle(discountPct === p && pctInput === "")}
                className="flex-1"
              >
                {p}%
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={pctInput}
              placeholder="%"
              onChange={(e) => {
                setPctInput(e.target.value);
                applyDiscountPct(Number(e.target.value) || 0);
              }}
              className="h-10 w-16 rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
            />
            {discountPct > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setPctInput("");
                  onDiscountPctChange(0);
                  onDiscountReasonChange?.("");
                }}
                className="h-10 rounded-lg border border-line px-3 text-xs text-muted hover:bg-surface2"
              >
                Quitar
              </button>
            ) : null}
          </div>
          {discountPct > 0 && onDiscountReasonChange ? (
            <select
              value={discountReason}
              onChange={(e) => onDiscountReasonChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-surface3 px-2 text-sm text-rondaCream"
            >
              <option value="">— Motivo del descuento —</option>
              {DISCOUNT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClearCart}
          disabled={lines.length === 0 || submitting}
          className="h-11 w-full rounded-lg border border-line text-sm font-semibold text-muted hover:bg-surface2 disabled:opacity-40"
        >
          Vaciar pedido
        </button>
        {paymentDeferred ? (
          <button
            type="button"
            onClick={onSubmitOrder}
            disabled={!canSubmitToKitchen}
            style={confirmKitchenButtonStyle(canSubmitToKitchen)}
            className="font-bold"
          >
            {submitting ? "Enviando…" : confirmButtonLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPaymentModalOpen(true)}
            disabled={lines.length === 0 || submitting || !phoneOkForImmediate}
            className="h-12 w-full rounded-lg bg-rondaAccent text-base font-black text-rondaCream hover:bg-rondaAccentHover disabled:opacity-40"
          >
            Cobrar
          </button>
        )}
      </div>

      {!paymentDeferred && paymentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface3 shadow-2xl">
            <div className="border-b border-line px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
                Total a cobrar
              </p>
              <p className="mt-1 text-4xl font-black tabular-nums text-rondaCream">
                ${grandTotal.toFixed(2)}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
                  Propina
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onTipModeChange(tipMode === "pct10" ? null : "pct10")
                    }
                    style={segmentToggleStyle(tipMode === "pct10")}
                  >
                    10%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTipModeChange(tipMode === "pct15" ? null : "pct15")
                    }
                    style={segmentToggleStyle(tipMode === "pct15")}
                  >
                    15%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTipModeChange(tipMode === "pct20" ? null : "pct20")
                    }
                    style={segmentToggleStyle(tipMode === "pct20")}
                  >
                    20%
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Otra cantidad $
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tipCustomInput}
                    onChange={(e) => onTipCustomInputChange(e.target.value)}
                    onFocus={() => onTipModeChange("custom")}
                    className={
                      tipMode === "custom"
                        ? "h-11 w-full rounded-lg border border-amber-700/90 bg-surface3 px-3 text-sm text-rondaCream"
                        : "h-11 w-full rounded-lg border border-line bg-surface3 px-3 text-sm text-rondaCream"
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <div className="flex justify-between text-muted">
                    <span>Subtotal</span>
                    <span className="tabular-nums text-rondaCream">
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Descuento</span>
                    <span className="tabular-nums text-rondaCream">
                      ${discount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Propina</span>
                    <span className="tabular-nums text-rondaCream">
                      ${tipAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-rondaCream">
                    <span>Total</span>
                    <span className="tabular-nums text-rondaCream">
                      ${grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
                  Pago
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onPaymentMethodChange("cash")}
                    style={segmentToggleStyle(paymentMethod === "cash")}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => onPaymentMethodChange("card")}
                    style={segmentToggleStyle(paymentMethod === "card")}
                  >
                    Tarjeta
                  </button>
                  <button
                    type="button"
                    onClick={() => onPaymentMethodChange("mixed")}
                    style={segmentToggleStyle(paymentMethod === "mixed")}
                  >
                    Mixto
                  </button>
                </div>

                {paymentMethod === "cash" ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        Paga con $
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={cashTenderInput}
                        onChange={(e) => onCashTenderInputChange(e.target.value)}
                        className="h-11 w-full rounded-lg border border-line bg-surface3 px-3 text-sm text-rondaCream"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </div>
                    {cashInsufficient ? (
                      <p className="text-sm font-semibold tabular-nums text-red-400">
                        Monto insuficiente
                      </p>
                    ) : cashChange !== null ? (
                      <p className="text-sm font-semibold tabular-nums text-emerald-400">
                        Cambio: ${cashChange.toFixed(2)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {paymentMethod === "mixed" ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        Efectivo $
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={mixedCashInput}
                        onChange={(e) => onMixedCashInputChange(e.target.value)}
                        className="h-11 w-full rounded-lg border border-line bg-surface3 px-3 text-sm text-rondaCream"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        Entrega efectivo $
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={mixedCashTenderInput}
                        onChange={(e) =>
                          onMixedCashTenderInputChange(e.target.value)
                        }
                        className="h-11 w-full rounded-lg border border-line bg-surface3 px-3 text-sm text-rondaCream"
                        inputMode="decimal"
                        placeholder="Lo que entrega el cliente"
                      />
                    </div>
                    {mixedCashChange !== null ? (
                      <p className="text-sm font-semibold tabular-nums text-emerald-400">
                        Cambio efectivo: ${mixedCashChange.toFixed(2)}
                      </p>
                    ) : null}
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        Tarjeta $
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={mixedCardInput}
                        onChange={(e) => onMixedCardInputChange(e.target.value)}
                        className="h-11 w-full rounded-lg border border-line bg-surface3 px-3 text-sm text-rondaCream"
                        inputMode="decimal"
                      />
                    </div>
                    <p className="text-xs tabular-nums text-muted">
                      Total: ${grandTotal.toFixed(2)} | Pendiente: $
                      {mixedPending.toFixed(2)}
                    </p>
                    {!mixedSplitOk ? (
                      <p className="text-xs font-medium text-amber-500">
                        Los montos no coinciden con el total
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={onSubmitOrder}
                disabled={!canSubmitToKitchen}
                style={confirmKitchenButtonStyle(canSubmitToKitchen)}
                className="font-bold"
              >
                {submitting ? "Enviando…" : confirmButtonLabel}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setPaymentModalOpen(false)}
                className="h-11 w-full rounded-lg border border-line text-sm font-semibold text-muted hover:bg-surface2 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
