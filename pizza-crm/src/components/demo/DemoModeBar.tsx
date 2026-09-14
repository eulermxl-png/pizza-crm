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
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "34px",
  padding: "0 12px",
  borderRadius: "999px",
  fontSize: "12.5px",
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

/**
 * Barra flotante para navegar entre TODOS los perfiles.
 * Se muestra si la cuenta actual es super_admin (en producción, solo esas
 * cuentas), o si el entorno tiene NEXT_PUBLIC_DEMO_MODE = "true". En otro caso
 * no renderiza nada y no afecta a los demás usuarios.
 *
 * Va vertical, anclada al costado DERECHO, y se puede ocultar/mostrar.
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

  // Colapsada: pestañita vertical en el borde derecho para volver a mostrarla.
  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="Mostrar perfiles"
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 9999,
          background: "#241d18",
          border: "1px solid #e07a44",
          borderRight: "none",
          borderRadius: "10px 0 0 10px",
          color: "#e07a44",
          fontSize: "10px",
          fontWeight: 800,
          letterSpacing: "2px",
          padding: "12px 5px",
          writingMode: "vertical-rl",
          cursor: "pointer",
          boxShadow: "-4px 0 14px rgba(0,0,0,0.4)",
        }}
      >
        PERFILES
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: "10px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        width: "122px",
        maxHeight: "92vh",
        overflowY: "auto",
        background: "#241d18",
        border: "1px solid #e07a44",
        borderRadius: "16px",
        padding: "9px 9px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 2px 2px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "1.5px",
            color: "#e07a44",
          }}
        >
          PERFILES
        </span>
        <button
          type="button"
          onClick={toggle}
          title="Ocultar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "22px",
            width: "22px",
            borderRadius: "999px",
            background: "transparent",
            border: "1px solid #3a2f28",
            color: "#e07a44",
            fontSize: "11px",
            fontWeight: 800,
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          ▸
        </button>
      </div>

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
  );
}
