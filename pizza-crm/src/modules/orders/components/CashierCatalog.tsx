"use client";

import type { CSSProperties } from "react";

import { PRODUCT_CATEGORIES } from "@/modules/menu/constants";
import { SIZE_LABELS_ES } from "@/modules/menu/constants";
import type { ProductRow } from "@/modules/menu/types";

type Props = {
  products: ProductRow[];
  category: string;
  onCategoryChange: (c: string) => void;
  onSelectProduct: (p: ProductRow) => void;
};

const gridWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
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
  padding: 0,
  textAlign: "left",
};

const imageBoxStyle: CSSProperties = {
  width: "180px",
  height: "120px",
  overflow: "hidden",
  backgroundColor: "#2a2a2a",
};

const imgStyle: CSSProperties = {
  width: "100%",
  height: "120px",
  objectFit: "cover",
  display: "block",
};

const textBlockStyle: CSSProperties = {
  padding: "8px",
  height: "140px",
  overflow: "hidden",
  boxSizing: "border-box",
};

export default function CashierCatalog({
  products,
  category,
  onCategoryChange,
  onSelectProduct,
}: Props) {
  const filtered =
    category === "ALL"
      ? products
      : products.filter((p) => p.category === category);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onCategoryChange("ALL")}
          className={
            category === "ALL"
              ? "shrink-0 rounded-full bg-rondaAccent px-4 py-2 text-sm font-bold text-rondaCream"
              : "shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200"
          }
        >
          Todos
        </button>
        {PRODUCT_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCategoryChange(c)}
            className={
              category === c
                ? "shrink-0 rounded-full bg-rondaAccent px-4 py-2 text-sm font-bold text-rondaCream"
                : "shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200"
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-zinc-500">
            No hay productos en esta categoría.
          </p>
        ) : (
          <div style={gridWrapStyle}>
            {filtered.map((p) => {
              const from = Math.min(
                p.prices.small,
                p.prices.medium,
                p.prices.large,
              );
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProduct(p)}
                  style={cardStyle}
                >
                  <div style={imageBoxStyle}>
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt=""
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
                        Sin foto
                      </div>
                    )}
                  </div>
                  <div style={textBlockStyle}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "11px",
                        fontWeight: 700,
                        lineHeight: 1.25,
                        color: "#fafafa",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {p.name}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0 0",
                        fontSize: "10px",
                        color: "#a1a1aa",
                      }}
                    >
                      Desde ${from.toFixed(2)}
                    </p>
                    <p
                      style={{
                        margin: "4px 0 0 0",
                        fontSize: "9px",
                        color: "#71717a",
                      }}
                    >
                      {SIZE_LABELS_ES.medium} ${p.prices.medium.toFixed(2)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
