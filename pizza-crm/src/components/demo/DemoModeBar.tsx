"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { createClient } from "@/lib/supabase/client";

const PROFILES = [
  { href: "/cashier", label: "Cajero", match: "/cashier" },
  { href: "/kitchen", label: "Cocina", match: "/kitchen" },
  { href: "/monitor", label: "Monitor", match: "/monitor" },
  { href: "/owner", label: "Admin", match: "/owner" },
];

const tabBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "34px",
  padding: "0 14px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

/**
 * Barra flotante para navegar entre TODOS los perfiles.
 * Se muestra si la cuenta actual es super_admin (en producción, solo esa cuenta),
 * o si el entorno tiene NEXT_PUBLIC_DEMO_MODE = "true" (para un demo). En otro
 * caso no renderiza nada y no afecta a los demás usuarios.
 */
export default function DemoModeBar() {
  const pathname = usePathname() ?? "";
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      setShow(true);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setShow(false);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("super_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setShow((data as { super_admin?: boolean } | null)?.super_admin === true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;
  if (pathname.startsWith("/login") || pathname.startsWith("/no-access")) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "14px",
        transform: "translateX(-50%)",
        zIndex: 9999,
        maxWidth: "96vw",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "#241d18",
          border: "1px solid #e07a44",
          borderRadius: "999px",
          padding: "6px 8px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          overflowX: "auto",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "1.5px",
            color: "#e07a44",
            padding: "0 6px",
          }}
        >
          PERFILES
        </span>
        {PROFILES.map((p) => {
          const active = pathname.startsWith(p.match);
          return (
            <Link
              key={p.href}
              href={p.href}
              style={
                active
                  ? { ...tabBase, background: "#e07a44", color: "#1a1613" }
                  : {
                      ...tabBase,
                      background: "#2f2620",
                      color: "#efeadd",
                      border: "1px solid #3a2f28",
                    }
              }
            >
              {p.label}
            </Link>
          );
        })}
        <a
          href="/api/logout"
          style={{
            ...tabBase,
            background: "transparent",
            color: "#a4988a",
            border: "1px solid #3a2f28",
          }}
        >
          Salir
        </a>
      </div>
    </div>
  );
}
