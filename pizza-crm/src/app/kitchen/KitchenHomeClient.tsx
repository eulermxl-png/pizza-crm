"use client";

import { useState } from "react";

import { KitchenOrderBoard } from "@/modules/kitchen";
import { KitchenInventoryClient } from "@/modules/inventory";

type Tab = "inventory" | "orders";

export default function KitchenHomeClient() {
  const [tab, setTab] = useState<Tab>("inventory");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-2 flex shrink-0 gap-2 px-1">
        <button
          type="button"
          onClick={() => setTab("inventory")}
          className={
            tab === "inventory"
              ? "min-h-12 flex-1 rounded-xl bg-rondaAccent text-base font-black text-rondaCream"
              : "min-h-12 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 text-base font-bold text-zinc-300"
          }
        >
          Inventario
        </button>
        <button
          type="button"
          onClick={() => setTab("orders")}
          className={
            tab === "orders"
              ? "min-h-12 flex-1 rounded-xl bg-rondaAccent text-base font-black text-rondaCream"
              : "min-h-12 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 text-base font-bold text-zinc-300"
          }
        >
          Pedidos
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "inventory" ? (
          <KitchenInventoryClient />
        ) : (
          <KitchenOrderBoard />
        )}
      </div>
    </div>
  );
}
