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
  height: "30px",
  padding: "0 12px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

/**
 * Barra flotante para navegar entre TODOS los perfiles.
 * Se muestra si la cuenta actual es super_admin (en producción, solo esa cuenta),
 * o si el entorno tiene NEXT_PUBLIC_DEMO_MODE = "true" (para un demo). En otro
 * caso no renderiza nada y no afecta a los demás usuarios.
 *
 * Va anclada ARRIBA-centro y se puede ocultar/mostrar para no tapar la vista.
 */
export default function DemoModeBar() {
  const pathname = usePathname() ?? "";
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(true);

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

  // Recuerda si el usuario la dejó oculta.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("ronda_perfiles_open");
      if (saved === "0") setOpen(false);
    } catch {
      // ignore
    }
  }, []);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("ronda_perfiles_open", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (!show) return null;
  if (pathname.startsWith("/login") || pathname.startsWith("/no-access")) {
    return null;
  }

  const wrap: CSSProperties = {
    position: "fixed",
    left: "50%",
    top: "8px",
    transform: "translateX(-50%)",
    zIndex: 9999,
    maxWidth: "96vw",
  };

  // Colapsada: solo una pastilla chica para volver a mostrarla.
  if (!open) {
    return (
      <div style={wrap}>
        <button
          type="button"
          onClick={toggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            height: "26px",
            padding: "0 12px",
            borderRadius: "999px",
            background: "#241d18",
            border: "1px solid #e07a44",
            color: "#e07a44",
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "1.5px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
            cursor: "pointer",
          }}
        >
          PERFILES ▾
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "#241d18",
          border: "1px solid #e07a44",
          borderRadius: "999px",
          padding: "5px 7px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          overflowX: "auto",
        }}
      >
        <button
          type="button"
          onClick={toggle}
          title="Ocultar barra"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "26px",
            width: "26px",
            borderRadius: "999px",
            background: "transparent",
            border: "1px solid #3a2f28",
            color: "#e07a44",
            fontSize: "12px",
            fontWeight: 800,
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          ▴
        </button>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "1.5px",
            color: "#e07a44",
            padding: "0 4px",
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
