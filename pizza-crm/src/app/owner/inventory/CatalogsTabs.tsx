"use client";

import { useState } from "react";

import ConceptsManager from "./ConceptsManager";
import EmployeesManager from "./EmployeesManager";
import OwnerInventoryClient from "./OwnerInventoryClient";

type Tab = "materiales" | "conceptos" | "trabajadores";

const TABS: { id: Tab; label: string }[] = [
  { id: "materiales", label: "Materiales" },
  { id: "conceptos", label: "Conceptos de gasto" },
  { id: "trabajadores", label: "Trabajadores" },
];

export default function CatalogsTabs() {
  const [tab, setTab] = useState<Tab>("materiales");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-50">Catálogos</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Da de alta aquí lo que luego registrarás en Compras y Gastos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "h-10 rounded-lg bg-rondaAccent px-4 text-sm font-bold text-rondaCream"
                : "h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "materiales" ? <OwnerInventoryClient /> : null}
      {tab === "conceptos" ? <ConceptsManager /> : null}
      {tab === "trabajadores" ? <EmployeesManager /> : null}
    </div>
  );
}
