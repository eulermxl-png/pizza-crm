"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

// English: subscribe to products + customization changes so UIs update without full reload.
export function useMenuRealtimeSync(
  onProductsChange: () => void,
  onCustomizationsChange: () => void,
) {
  const productsCb = useRef(onProductsChange);
  const customCb = useRef(onCustomizationsChange);

  productsCb.current = onProductsChange;
  customCb.current = onCustomizationsChange;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("menu-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => productsCb.current(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customization_options" },
        () => customCb.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
