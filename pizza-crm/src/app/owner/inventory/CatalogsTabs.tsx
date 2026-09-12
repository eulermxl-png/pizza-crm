"use client";

import { useState } from "react";

import ConceptsManager from "./ConceptsManager";
import EmployeesManager from "./EmployeesManager";
import OwnerInventoryClient from "./OwnerInventoryClient";
import PackagingManager from "./PackagingManager";

type Tab = "materiales" | "empaque" | "conceptos" | "trabajadores";

const TABS: { id: Tab; label: string }[] = [
  { id: "materiales", label: "Materiales" },
  { id: "empaque", label: "Empaque" },
  { id: "conceptos", label: "Conceptos de gasto" },
  { id: "trabajadores", label: "Trabajadores" },
];

export default function CatalogsTabs() {
  const [tab, setTab] = useState<Tab>("materiales");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-rondaCream">Catálogos</h2>
        <p className="mt-1 text-sm text-muted">
          Da de alta aquí lo que luego registrarás en Compras y Gastos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "h-10 rounded-lg bg-rondaAccent px-4 text-sm font-bold text-rondaCream"
                : "h-10 rounded-lg border border-line bg-surface2 px-4 text-sm font-semibold text-rondaCream hover:bg-surface3"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "materiales" ? <OwnerInventoryClient /> : null}
      {tab === "empaque" ? <PackagingManager /> : null}
      {tab === "conceptos" ? <ConceptsManager /> : null}
      {tab === "trabajadores" ? <EmployeesManager /> : null}
    </div>
  );
}
