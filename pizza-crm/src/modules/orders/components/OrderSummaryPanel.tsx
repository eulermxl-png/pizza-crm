"use client";

import { SIZE_LABELS_ES } from "@/modules/menu/constants";
import {
  mixedAmountsMatchTotal,
  parseMoneyInput,
} from "../lib/cartMath";
import type { CartLine, OrderOrigin, OrderPaymentMethod } from "../types";

const TOGGLE_ACTIVE =
  "h-11 flex-1 rounded-lg bg-orange-500 text-sm font-bold text-white";
const TOGGLE_INACTIVE =
  "h-11 flex-1 rounded-lg border border-[#333] bg-[#1a1a1a] text-sm font-semibold text-white";

type Props = {
  origin: OrderOrigin;
  onOriginChange: (o: OrderOrigin) => void;
  paymentMethod: OrderPaymentMethod;
  onPaymentMethodChange: (p: OrderPaymentMethod) => void;
  mixedCashInput: string;
  mixedCardInput: string;
  onMixedCashInputChange: (v: string) => void;
  onMixedCardInputChange: (v: string) => void;
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
}: Props) {
  const total = Math.max(0, subtotal - discount);
  const mixedCash = parseMoneyInput(mixedCashInput);
  const mixedCard = parseMoneyInput(mixedCardInput);
  const mixedSum = mixedCash + mixedCard;
  const mixedPending = total - mixedSum;
  const mixedOk =
    paymentMethod !== "mixed" ||
    mixedAmountsMatchTotal(mixedCash, mixedCard, total);

  return (
    <div
      className="flex min-h-0 w-full flex-col bg-zinc-950/80"
      style={{ height: "100%", overflow: "hidden" }}
    >
      <div className="shrink-0 space-y-3 border-b border-zinc-800 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Origen del pedido
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOriginChange("walk_in")}
            className={origin === "walk_in" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}
          >
            Mostrador
          </button>
          <button
            type="button"
            onClick={() => onOriginChange("phone")}
            className={origin === "phone" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}
          >
            Teléfono
          </button>
        </div>

        {origin === "phone" ? (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Cliente</label>
              <input
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                list="cashier-phone-names"
                className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                placeholder="Nombre"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Teléfono</label>
              <input
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                list="cashier-phone-nums"
                className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                placeholder="Teléfono"
                inputMode="tel"
              />
            </div>
            <datalist id="cashier-phone-names">
              {phoneSuggestions.map((s) => (
                <option
                  key={`n-${s.customer_phone}`}
                  value={s.customer_name ?? ""}
                />
              ))}
            </datalist>
            <datalist id="cashier-phone-nums">
              {phoneSuggestions.map((s) => (
                <option key={`p-${s.customer_phone}`} value={s.customer_phone} />
              ))}
            </datalist>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-zinc-800 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Pago
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPaymentMethodChange("cash")}
              className={
                paymentMethod === "cash" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
              }
            >
              Efectivo
            </button>
            <button
              type="button"
              onClick={() => onPaymentMethodChange("card")}
              className={
                paymentMethod === "card" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
              }
            >
              Tarjeta
            </button>
            <button
              type="button"
              onClick={() => onPaymentMethodChange("mixed")}
              className={
                paymentMethod === "mixed" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
              }
            >
              Mixto
            </button>
          </div>
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
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
                      {SIZE_LABELS_ES[line.size]} · $
                      {line.unitPrice.toFixed(2)} c/u
                    </p>
                    {line.customizationNames.length > 0 ? (
                      <p className="mt-1 text-xs text-zinc-400">
                        {line.customizationNames.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-orange-400">
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

      <div className="shrink-0 space-y-3 border-t border-zinc-800 pt-3">
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
          <span className="tabular-nums text-orange-400">${total.toFixed(2)}</span>
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
          disabled={lines.length === 0 || submitting || !mixedOk}
          className="h-12 w-full rounded-lg bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {submitting ? "Enviando…" : "Confirmar y enviar a cocina"}
        </button>
      </div>
    </div>
  );
}
