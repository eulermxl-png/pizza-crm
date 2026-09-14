"use client";

import { KitchenOrderBoard } from "@/modules/kitchen";

// Cocina solo muestra la comanda (pedidos). El checklist de insumos se quitó:
// el inventario se maneja desde Admin/Compras.
export default function KitchenHomeClient() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <KitchenOrderBoard />
    </div>
  );
}
