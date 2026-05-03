"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import {
  loadQueryWithEmptyRetry,
  waitForClientAuthSession,
} from "@/lib/supabase/menuDataFetch";
import {
  STANDARD_PRODUCT_SIZE,
  type ProductSizeChoice,
  type SizeKey,
} from "@/modules/menu/constants";
import { useMenuRealtimeSync } from "@/modules/menu/hooks/useMenuRealtimeSync";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import {
  addPendingOrder,
  loadMenuCache,
  saveMenuCache,
} from "@/lib/offline/offlineStorage";
import {
  mapCustomizationFromDb,
  mapProductFromDb,
} from "@/modules/menu/lib/mapRow";
import type { CustomizationRow, ProductRow } from "@/modules/menu/types";

import AddProductModal from "./components/AddProductModal";
import CashierActiveOrdersPanel from "./components/CashierActiveOrdersPanel";
import CashierCatalog from "./components/CashierCatalog";
import OrderSummaryPanel from "./components/OrderSummaryPanel";
import {
  cartSubtotal,
  cartTotal,
  mixedAmountsMatchTotal,
  orderPaymentAmounts,
  parseMoneyInput,
} from "./lib/cartMath";
import { makeCartLineKey } from "./lib/lineKey";
import type {
  CartLine,
  OrderOrigin,
  OrderPaymentMethod,
  PhoneSuggestion,
} from "./types";

import type {
  OfflineCachedMenu,
  OfflinePendingOrder,
} from "@/lib/offline/offlineTypes";

type AddPayload = {
  size: ProductSizeChoice;
  quantity: number;
  customizationNames: string[];
};

export type CashierOrderScreenProps = {
  initialTableId?: string | null;
  initialBarra?: boolean;
};

// English: merges catalog loading, cart state, and Supabase order creation for the cashier POS.
export default function CashierOrderScreen({
  initialTableId = null,
  initialBarra = false,
}: CashierOrderScreenProps) {
  const supabase = useMemo(() => createClient(), []);
  const onlineStatus = useOnlineStatus();
  const isOffline = onlineStatus === "offline";

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customizations, setCustomizations] = useState<CustomizationRow[]>(
    [],
  );
  const [category, setCategory] = useState("ALL");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [origin, setOrigin] = useState<OrderOrigin>("walk_in");
  const [paymentMethod, setPaymentMethod] =
    useState<OrderPaymentMethod>("cash");
  const [mixedCashInput, setMixedCashInput] = useState("");
  const [mixedCardInput, setMixedCardInput] = useState("");
  /** Visual only: efectivo que entrega el cliente (cambio en caja). */
  const [cashTenderInput, setCashTenderInput] = useState("");
  const [mixedCashTenderInput, setMixedCashTenderInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneSuggestions, setPhoneSuggestions] = useState<PhoneSuggestion[]>(
    [],
  );
  const [modalProduct, setModalProduct] = useState<ProductRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuFromCache, setMenuFromCache] = useState(false);

  const [sessionTableId, setSessionTableId] = useState<string | null>(
    initialBarra ? null : initialTableId ?? null,
  );
  const [sessionTableName, setSessionTableName] = useState<string | null>(null);

  useEffect(() => {
    setSessionTableId(initialBarra ? null : initialTableId ?? null);
  }, [initialTableId, initialBarra]);

  useEffect(() => {
    if (!sessionTableId) {
      setSessionTableName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: tErr } = await supabase
        .from("tables")
        .select("name,status,number")
        .eq("id", sessionTableId)
        .maybeSingle();
      if (cancelled) return;
      if (tErr || !data) {
        setSessionTableName(null);
        setError("No se encontró la mesa.");
        return;
      }
      setSessionTableName(data.name as string);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionTableId, supabase]);

  const paymentDeferred = Boolean(sessionTableId) && !initialBarra;

  const loadCatalog = useCallback(async () => {
    setMenuFromCache(false);
    if (isOffline) {
      try {
        const cached = await loadMenuCache();
        if (!cached) {
          setProducts([]);
          setCustomizations([]);
          setError("No hay menú en caché. Conéctate para descargarlo.");
          return;
        }

        setProducts(cached.products as unknown as ProductRow[]);
        setCustomizations(cached.customizations as unknown as CustomizationRow[]);
        setMenuFromCache(true);
        setError(null);
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar menú desde caché.");
        return;
      }
    }

    try {
      await waitForClientAuthSession(supabase);

      const [pRes, cRes] = await Promise.all([
        loadQueryWithEmptyRetry(
          () =>
            supabase
              .from("products")
              .select("id,name,category,image_url,prices,active,has_sizes")
              .eq("active", true)
              .order("category", { ascending: true })
              .order("name", { ascending: true }),
          (data) => !data || data.length === 0,
        ),
        supabase
          .from("customization_options")
          .select("id,name,active,extra_price")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (pRes.error) {
        setError(pRes.error.message);
        return;
      }
      if (cRes.error) {
        setError(cRes.error.message);
        return;
      }

      const pMapped = (pRes.data ?? []).map(mapProductFromDb);
      const cMapped = (cRes.data ?? []).map(mapCustomizationFromDb);

      setProducts(pMapped);
      setCustomizations(cMapped);
      setError(null);

      // Cache menu for offline usage.
      try {
        await saveMenuCache({
          products: pMapped as OfflineCachedMenu["products"],
          customizations: cMapped as OfflineCachedMenu["customizations"],
        });
      } catch {
        // Best-effort caching; don't block online flow.
      }
    } catch (e) {
      // If Supabase fails to respond, transparently fall back to IndexedDB.
      try {
        const cached = await loadMenuCache();
        if (!cached) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo cargar el menú. Conéctate para descargarlo.",
          );
          return;
        }

        setProducts(cached.products as unknown as ProductRow[]);
        setCustomizations(
          cached.customizations as unknown as CustomizationRow[],
        );
        setMenuFromCache(true);
        setError(null);
      } catch (e2) {
        setError(
          e2 instanceof Error ? e2.message : "Error al cargar menú offline.",
        );
      }
    }
  }, [supabase, isOffline]);

  const reloadCatalog = useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadCatalog();
      setLoading(false);
    })();
  }, [loadCatalog]);

  useMenuRealtimeSync(reloadCatalog, reloadCatalog);

  const loadPhoneSuggestions = useCallback(async () => {
    if (isOffline) return;
    const { data, error: qErr } = await supabase
      .from("orders")
      .select("customer_name, customer_phone")
      .eq("origin", "phone")
      .not("customer_phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (qErr || !data) return;

    const m = new Map<string, PhoneSuggestion>();
    for (const row of data) {
      const phone = row.customer_phone?.trim();
      if (!phone) continue;
      if (!m.has(phone)) {
        m.set(phone, {
          customer_phone: phone,
          customer_name: row.customer_name,
        });
      }
    }
    setPhoneSuggestions(Array.from(m.values()).slice(0, 40));
  }, [supabase, isOffline]);

  useEffect(() => {
    void loadPhoneSuggestions();
  }, [loadPhoneSuggestions]);

  useEffect(() => {
    if (paymentMethod !== "mixed") {
      setMixedCashInput("");
      setMixedCardInput("");
      setMixedCashTenderInput("");
    }
  }, [paymentMethod]);

  useEffect(() => {
    if (paymentMethod !== "cash") {
      setCashTenderInput("");
    }
  }, [paymentMethod]);

  const subtotal = useMemo(() => cartSubtotal(cart), [cart]);
  const total = useMemo(() => cartTotal(subtotal, discount), [subtotal, discount]);

  // English: append quantity when the same product/size/customizations line already exists.
  function addToCart(product: ProductRow, payload: AddPayload) {
    const extrasSum = payload.customizationNames.reduce((sum, name) => {
      const opt = customizations.find((c) => c.name === name);
      return sum + (opt?.extra_price ?? 0);
    }, 0);
    const lineSize: ProductSizeChoice = product.has_sizes
      ? payload.size
      : STANDARD_PRODUCT_SIZE;
    const priceKey: SizeKey = product.has_sizes
      ? (payload.size as SizeKey)
      : "small";
    const unitPrice = product.prices[priceKey] + extrasSum;
    const key = makeCartLineKey(product.id, lineSize, payload.customizationNames);

    setCart((prev) => {
      const i = prev.findIndex((l) => l.key === key);
      if (i >= 0) {
        const next = [...prev];
        next[i] = {
          ...next[i],
          quantity: next[i].quantity + payload.quantity,
        };
        return next;
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          size: lineSize,
          quantity: payload.quantity,
          unitPrice,
          customizationNames: payload.customizationNames,
        },
      ];
    });
  }

  function clearCart() {
    if (cart.length === 0) return;
    if (window.confirm("¿Vaciar el pedido actual?")) {
      setCart([]);
      setDiscount(0);
      setMixedCashInput("");
      setMixedCardInput("");
      setCashTenderInput("");
      setMixedCashTenderInput("");
    }
  }

  async function submitOrder() {
    setError(null);
    setNotice(null);
    if (cart.length === 0) return;

    if (paymentDeferred) {
      if (
        isOffline ||
        (typeof navigator !== "undefined" && !navigator.onLine)
      ) {
        setError("Las comandas de mesa requieren conexión a internet.");
        return;
      }
    }

    if (!paymentDeferred && origin === "phone" && !customerPhone.trim()) {
      setError("Ingresa el teléfono del cliente.");
      return;
    }
    if (
      !paymentDeferred &&
      paymentMethod === "mixed" &&
      !mixedAmountsMatchTotal(
        parseMoneyInput(mixedCashInput),
        parseMoneyInput(mixedCardInput),
        total,
      )
    ) {
      setError("Los montos no coinciden con el total");
      return;
    }

    const { cash_amount, card_amount } = paymentDeferred
      ? { cash_amount: 0, card_amount: 0 }
      : orderPaymentAmounts(
          paymentMethod,
          total,
          mixedCashInput,
          mixedCardInput,
        );

    const isNetworkError = (e: unknown) => {
      if (e instanceof TypeError) return true;
      if (e instanceof Error) {
        const msg = e.message ?? "";
        return /fetch failed|network|networkerror|failed to fetch|timeout|timed out|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(
          msg,
        );
      }
      return false;
    };

    async function saveOrderLocally() {
      const localId = crypto.randomUUID
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random()}`;

      const pending: OfflinePendingOrder = {
        local_id: localId,
        created_at: new Date().toISOString(),
        origin,
        customer_name: customerName.trim() || null,
        customer_phone:
          origin === "phone" ? customerPhone.trim() || null : null,
        status: "pending",
        payment_method: paymentMethod,
        cash_amount,
        card_amount,
        discount,
        total,
        items: cart.map((l, idx) => ({
          local_line_id: `${localId}_${idx}`,
          product_id: l.productId,
          productName: l.productName,
          size: l.size,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          customizations: l.customizationNames,
        })),
      };

      await addPendingOrder(pending);
      setCart([]);
      setDiscount(0);
      setMixedCashInput("");
      setMixedCardInput("");
      setCashTenderInput("");
      setMixedCashTenderInput("");
      setNotice("Pedido guardado localmente (sin conexión)");
    }

    setSubmitting(true);
    try {
      const offlineNow =
        isOffline ||
        (typeof navigator !== "undefined" && !navigator.onLine);

      if (offlineNow) {
        if (paymentDeferred) {
          setError("Las comandas de mesa requieren conexión a internet.");
          return;
        }
        await saveOrderLocally();
        return;
      }

      // Online path: create the order in Supabase. If it's a network error, fallback to local.
      try {
        if (paymentDeferred && sessionTableId) {
          const { data: tbl, error: tblErr } = await supabase
            .from("tables")
            .select("status")
            .eq("id", sessionTableId)
            .single();

          if (tblErr || !tbl) {
            throw new Error("No se pudo verificar la mesa.");
          }

          if (tbl.status === "free") {
            const openedAt = new Date().toISOString();
            const { data: opened, error: openErr } = await supabase
              .from("tables")
              .update({ status: "occupied", opened_at: openedAt })
              .eq("id", sessionTableId)
              .eq("status", "free")
              .select("id");

            if (openErr) throw openErr;
            if (!opened?.length) {
              const { data: again } = await supabase
                .from("tables")
                .select("status")
                .eq("id", sessionTableId)
                .single();
              if (
                again?.status !== "occupied" &&
                again?.status !== "waiting_payment"
              ) {
                throw new Error(
                  "La mesa no está disponible para tomar pedidos.",
                );
              }
            }
          } else if (
            tbl.status !== "occupied" &&
            tbl.status !== "waiting_payment"
          ) {
            throw new Error(
              "Esta mesa no puede recibir pedidos en este momento.",
            );
          }
        }

        const insertOrigin: OrderOrigin = paymentDeferred
          ? "walk_in"
          : origin;

        const { data: orderRow, error: oErr } = await supabase
          .from("orders")
          .insert({
            origin: insertOrigin,
            customer_name: customerName.trim() || null,
            customer_phone:
              insertOrigin === "phone" ? customerPhone.trim() || null : null,
            status: "pending",
            payment_method: paymentDeferred ? null : paymentMethod,
            cash_amount,
            card_amount,
            discount,
            total,
            table_id: paymentDeferred ? sessionTableId : null,
            is_table_order: paymentDeferred,
          })
          .select("id")
          .single();

        if (oErr) throw oErr;
        if (!orderRow?.id) throw new Error("Pedido no creado");

        const rows = cart.map((l) => ({
          order_id: orderRow.id,
          product_id: l.productId,
          size: l.size,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          customizations: l.customizationNames,
        }));

        const { error: iErr } = await supabase
          .from("order_items")
          .insert(rows);
        if (iErr) throw iErr;

        if (paymentDeferred && sessionTableId) {
          await supabase
            .from("tables")
            .update({ current_order_id: orderRow.id })
            .eq("id", sessionTableId);
        }

        setCart([]);
        setDiscount(0);
        setMixedCashInput("");
        setMixedCardInput("");
        setCashTenderInput("");
        setMixedCashTenderInput("");
        void loadPhoneSuggestions();
      } catch (e) {
        if (
          isNetworkError(e) ||
          (typeof navigator !== "undefined" && !navigator.onLine)
        ) {
          if (!paymentDeferred) {
            window.dispatchEvent(
              new Event("supabase_connection_failed"),
            );
            await saveOrderLocally();
          } else {
            setError(
              "Sin conexión. No se pudo guardar la comanda de mesa.",
            );
          }
          return;
        }
        throw e;
      }
    } catch (e) {
      if (
        isNetworkError(e) ||
        (typeof navigator !== "undefined" && !navigator.onLine)
      ) {
        if (!paymentDeferred) {
          window.dispatchEvent(
            new Event("supabase_connection_failed"),
          );
          await saveOrderLocally();
        } else {
          setError(
            "Sin conexión. No se pudo guardar la comanda de mesa.",
          );
        }
        return;
      }

      setError(e instanceof Error ? e.message : "No se pudo enviar el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex w-full flex-1 flex-col"
      style={{ minHeight: 0, overflow: "hidden" }}
    >
      {notice ? (
        <div className="mb-2 shrink-0 rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-2 shrink-0 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {initialBarra ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">
          <span className="font-bold text-rondaCream">Barra — orden rápida</span>
          <Link
            href="/cashier/tables"
            className="text-xs font-semibold text-zinc-400 underline hover:text-zinc-200"
          >
            Ver mesas
          </Link>
        </div>
      ) : null}
      {paymentDeferred && sessionTableId ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
          <span className="font-bold">
            {sessionTableName ?? "Mesa"} — pedido (ocupada al confirmar en cocina)
          </span>
          <Link
            href="/cashier/tables"
            className="text-xs font-semibold text-amber-200/90 underline hover:text-amber-50"
          >
            Mapa de mesas
          </Link>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          height: "100%",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <section
          style={{
            width: "65%",
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            paddingRight: "12px",
            boxSizing: "border-box",
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3 shrink-0">
            <h2 className="text-lg font-bold text-zinc-100">Productos</h2>
            {isOffline && menuFromCache ? (
              <span className="shrink-0 rounded-full border border-amber-700 bg-amber-950/30 px-3 py-1 text-xs font-semibold text-amber-100">
                Menú desde caché
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-zinc-500">
              <p className="font-semibold text-zinc-300">Cargando menú…</p>
              <p className="max-w-sm text-sm text-zinc-600">
                Conectando la sesión y cargando productos. Si la lista viene
                vacía, se reintenta automáticamente.
              </p>
            </div>
          ) : (
            <CashierCatalog
              products={products}
              category={category}
              onCategoryChange={setCategory}
              onSelectProduct={(p) => {
                setModalProduct(p);
                setModalOpen(true);
              }}
            />
          )}
        </section>

        <div
          style={{
            width: "35%",
            flexShrink: 0,
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid #27272a",
            paddingLeft: "16px",
            boxSizing: "border-box",
          }}
        >
          <CashierActiveOrdersPanel />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OrderSummaryPanel
            origin={origin}
            onOriginChange={setOrigin}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            mixedCashInput={mixedCashInput}
            mixedCardInput={mixedCardInput}
            onMixedCashInputChange={setMixedCashInput}
            onMixedCardInputChange={setMixedCardInput}
            cashTenderInput={cashTenderInput}
            onCashTenderInputChange={setCashTenderInput}
            mixedCashTenderInput={mixedCashTenderInput}
            onMixedCashTenderInputChange={setMixedCashTenderInput}
            customerName={customerName}
              customerPhone={customerPhone}
              onCustomerNameChange={setCustomerName}
              onCustomerPhoneChange={setCustomerPhone}
              phoneSuggestions={phoneSuggestions}
              lines={cart}
              subtotal={subtotal}
              discount={discount}
              onDiscountChange={setDiscount}
              onRemoveLine={(key) =>
                setCart((prev) => prev.filter((l) => l.key !== key))
              }
              onClearCart={clearCart}
              onSubmitOrder={() => void submitOrder()}
              submitting={submitting}
              paymentDeferred={paymentDeferred}
            />
          </div>
        </div>
      </div>

      <AddProductModal
        open={modalOpen}
        product={modalProduct}
        customizationOptions={customizations}
        onClose={() => {
          setModalOpen(false);
          setModalProduct(null);
        }}
        onAdd={(payload) => {
          if (modalProduct) addToCart(modalProduct, payload);
        }}
      />
    </div>
  );
}
