"use client";

import type { CSSProperties } from "react";

import { SIZE_KEYS, SIZE_LABELS_ES } from "../constants";
import type { ProductRow } from "../types";

type Props = {
  products: ProductRow[];
  busyId: string | null;
  onEdit: (product: ProductRow) => void;
  onToggleActive: (product: ProductRow) => void;
};

const gridWrapperStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 180px))",
  gap: "16px",
  padding: "16px",
};

const cardStyle: CSSProperties = {
  width: "180px",
  height: "260px",
  overflow: "hidden",
  borderRadius: "8px",
  border: "1px solid #333",
  backgroundColor: "#1a1a1a",
  cursor: "pointer",
};

const imageContainerStyle: CSSProperties = {
  width: "180px",
  height: "120px",
  overflow: "hidden",
  backgroundColor: "#2a2a2a",
  position: "relative",
};

const imgStyle: CSSProperties = {
  width: "100%",
  height: "120px",
  objectFit: "cover",
  display: "block",
};

export default function ProductGrid({
  products,
  busyId,
  onEdit,
  onToggleActive,
}: Props) {
  if (products.length === 0) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "#a1a1aa",
          border: "1px dashed #3f3f46",
          borderRadius: "12px",
          backgroundColor: "rgba(24, 24, 27, 0.4)",
        }}
      >
        Todavía no hay productos. Agrega el primero para verlo en el punto de
        venta.
      </div>
    );
  }

  return (
    <div style={gridWrapperStyle}>
      {products.map((p) => {
        const busy = busyId === p.id;
        const minPrice = Math.min(
          p.prices.small,
          p.prices.medium,
          p.prices.large,
        );

        return (
          <article key={p.id} style={cardStyle}>
            <div style={imageContainerStyle}>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  style={imgStyle}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "120px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#71717a",
                    fontSize: "11px",
                  }}
                >
                  Sin imagen
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  left: "6px",
                  top: "6px",
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: p.active ? "#fff" : "#d4d4d8",
                    backgroundColor: p.active ? "#059669" : "rgba(24,24,27,0.92)",
                  }}
                >
                  {p.active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: "8px",
                height: "140px",
                overflow: "hidden",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  overflow: "hidden",
                }}
              >
              <h3
                style={{
                  margin: 0,
                  fontSize: "11px",
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: "#fafafa",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {p.name}
              </h3>
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#71717a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.category}
              </p>
              <p
                style={{
                  margin: "6px 0 0 0",
                  fontSize: "11px",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "#fb923c",
                }}
              >
                Desde ${minPrice.toFixed(2)}
              </p>
              <ul
                style={{
                  margin: "6px 0 0 0",
                  padding: 0,
                  listStyle: "none",
                  fontSize: "9px",
                  lineHeight: 1.35,
                  color: "#a1a1aa",
                  flex: 1,
                  overflow: "hidden",
                }}
              >
                {SIZE_KEYS.map((k) => (
                  <li
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "4px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#71717a",
                      }}
                    >
                      {SIZE_LABELS_ES[k]}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontWeight: 500,
                        color: "#d4d4d8",
                      }}
                    >
                      ${p.prices[k].toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                  marginTop: "auto",
                  paddingTop: "6px",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(p);
                  }}
                  style={{
                    minHeight: "44px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: "#3f3f46",
                    color: "#fafafa",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "0 4px",
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(p);
                  }}
                  style={{
                    minHeight: "44px",
                    border: "1px solid #52525b",
                    borderRadius: "6px",
                    backgroundColor: "rgba(9,9,11,0.85)",
                    color: "#d4d4d8",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: busy ? "not-allowed" : "pointer",
                    padding: "0 4px",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy
                    ? "…"
                    : p.active
                      ? "Desactivar"
                      : "Activar"}
                </button>
              </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
