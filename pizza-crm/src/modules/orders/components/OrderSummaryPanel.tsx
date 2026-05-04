"use client";

import type { CSSProperties } from "react";

import { sizeChoiceLabelEs } from "@/modules/menu/constants";
import {
  mixedAmountsMatchTotal,
  parseMoneyInput,
} from "../lib/cartMath";
import type { CartLine, OrderOrigin, OrderPaymentMethod } from "../types";

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

type Props = {
  origin: OrderOrigin;
  onOriginChange: (o: OrderOrigin) => void;
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
  discount: number;
  onDiscountChange: (v: number) => void;
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
  onDiscountChange,
  onRemoveLine,
  onClearCart,
  onSubmitOrder,
  submitting,
  paymentDeferred = false,
  hideCustomerNameField = false,
  confirmButtonLabel = "Confirmar y enviar a cocina",
}: Props) {
  const total = Math.max(0, subtotal - discount);
  const mixedCash = parseMoneyInput(mixedCashInput);
  const mixedCard = parseMoneyInput(mixedCardInput);
  const mixedSum = mixedCash + mixedCard;
  const mixedPending = total - mixedSum;
  const mixedOk =
    paymentMethod !== "mixed" ||
    mixedAmountsMatchTotal(mixedCash, mixedCard, total);

  const cashTenderEntered = cashTenderInput.trim() !== "";
  const cashTender = parseMoneyInput(cashTenderInput);
  const cashChange =
    cashTenderEntered && cashTender >= total ? cashTender - total : null;
  const cashInsufficient =
    paymentMethod === "cash" &&
    cashTenderEntered &&
    cashTender < total &&
    total > 0;

  const mixedTenderEntered = mixedCashTenderInput.trim() !== "";
  const mixedCashTender = parseMoneyInput(mixedCashTenderInput);
  const mixedCashChange =
    paymentMethod === "mixed" &&
    mixedTenderEntered &&
    mixedCashTender > mixedCash
      ? mixedCashTender - mixedCash
      : null;

  const canSubmitToKitchen =
    lines.length > 0 && !submitting && (paymentDeferred || mixedOk);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950/80">
      {/* Scroll: origen, nombre de orden, pago y líneas; totales en el pie fijo */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain border-b border-zinc-800">
        <div className="space-y-3 pb-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Origen del pedido
          </p>
          <div className="flex gap-2">
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
          </div>

          {origin === "phone" ? (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Teléfono
                </label>
                <input
                  value={customerPhone}
                  onChange={(e) => onCustomerPhoneChange(e.target.value)}
                  list="cashier-phone-nums"
                  className="h-11 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm text-zinc-100"
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
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Nombre de la orden (opcional)
              </label>
              <input
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                list={
                  origin === "phone" ? "cashier-phone-names-origin" : undefined
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
              {origin === "phone" ? (
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

          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Pago
            </p>
            {paymentDeferred ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
                Cuenta de mesa: el pago se registra al usar{" "}
                <strong className="text-zinc-100">Cobrar mesa</strong> en la
                pantalla Mesas. Este envío solo añade consumo a la cuenta y lo
                manda a cocina.
              </div>
            ) : (
              <>
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
                  <label className="mb-1 block text-xs text-zinc-400">
                    Paga con $
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={cashTenderInput}
                    onChange={(e) => onCashTenderInputChange(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
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
                  <label className="mb-1 block text-xs text-zinc-400">
                    Efectivo $
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={mixedCashInput}
                    onChange={(e) => onMixedCashInputChange(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
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
                    className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
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
                  <label className="mb-1 block text-xs text-zinc-400">
                    Tarjeta $
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={mixedCardInput}
                    onChange={(e) => onMixedCardInputChange(e.target.value)}
                    className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                    inputMode="decimal"
                  />
                </div>
                <p className="text-xs tabular-nums text-zinc-400">
                  Total: ${total.toFixed(2)} | Pendiente: $
                  {mixedPending.toFixed(2)}
                </p>
                {!mixedOk ? (
                  <p className="text-xs font-medium text-amber-500">
                    Los montos no coinciden con el total
                  </p>
                ) : null}
              </div>
            ) : null}
              </>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-800 py-3">
          <p className="mb-2 text-sm font-bold text-zinc-200">Pedido actual</p>
          {lines.length === 0 ? (
            <p className="text-sm text-zinc-500">Toca un producto para añadirlo.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.key}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">
                        {line.quantity}× {line.productName}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {sizeChoiceLabelEs(line.size)} · $
                        {line.unitPrice.toFixed(2)} c/u
                      </p>
                      {line.customizationNames.length > 0 ? (
                        <p className="mt-1 text-xs text-zinc-400">
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

      <div className="shrink-0 space-y-3 bg-zinc-950 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]">
        <div className="flex justify-between text-sm text-zinc-400">
          <span>Subtotal</span>
          <span className="font-semibold tabular-nums text-zinc-200">
            ${subtotal.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-xs text-zinc-400">Descuento $</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={discount || ""}
            onChange={(e) =>
              onDiscountChange(Math.max(0, Number(e.target.value) || 0))
            }
            className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100"
          />
        </div>
        <div className="flex justify-between text-base font-bold text-zinc-50">
          <span>Total</span>
          <span className="tabular-nums text-rondaCream">${total.toFixed(2)}</span>
        </div>

        <button
          type="button"
          onClick={onClearCart}
          disabled={lines.length === 0 || submitting}
          className="h-11 w-full rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          Vaciar pedido
        </button>
        <button
          type="button"
          onClick={onSubmitOrder}
          disabled={!canSubmitToKitchen}
          style={confirmKitchenButtonStyle(canSubmitToKitchen)}
          className="font-bold"
        >
          {submitting ? "Enviando…" : confirmButtonLabel}
        </button>
      </div>
    </div>
  );
}
