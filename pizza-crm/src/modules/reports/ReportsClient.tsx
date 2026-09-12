"use client";

import { useState } from "react";

import { Segmented } from "@/components/ui";
import ReportsDashboardClient from "./ReportsDashboardClient";
import OrdersExportClient from "./OrdersExportClient";

export default function ReportsClient() {
  const [tab, setTab] = useState<"tablero" | "ordenes">("tablero");
  return (
    <div className="space-y-6">
      <Segmented
        size="md"
        value={tab}
        onChange={(k) => setTab(k)}
        options={[
          { key: "tablero", label: "Tablero" },
          { key: "ordenes", label: "Órdenes" },
        ]}
      />
      {tab === "tablero" ? <ReportsDashboardClient /> : <OrdersExportClient />}
    </div>
  );
}
