import {
  platformLabelEs,
  type PlatformPriceMap,
  type SalesPlatform,
} from "@/modules/menu/lib/platforms";

import { INCLUDED_IN_COMBO_NOTE } from "./comboItemMetadata";
import type { CartLine } from "../types";

export type PricedCartLine = CartLine & {
  /** Motivo por el que la línea no se puede registrar en la plataforma. */
  platformIssue: string | null;
};

/**
 * El carrito guarda siempre el precio de mostrador (`unitPrice`).
 * Si el pedido es de una plataforma, cada línea toma el precio de esa
 * plataforma; si cambia el origen se recalcula todo (no importa el orden
 * en que el cajero capture productos y origen).
 *
 * Reglas en plataforma:
 * - Producto no dado de alta → alerta, bloquea registrar.
 * - Mitad y mitad, extras y cortesía → no aplican, bloquean registrar.
 * - Componentes de combo → $0 (el precio va en el combo), pero cada pizza
 *   del combo también debe estar dada de alta en la plataforma.
 */
export function applyPlatformPricing(
  cart: CartLine[],
  platform: SalesPlatform | null,
  priceMap: PlatformPriceMap,
): PricedCartLine[] {
  if (!platform) {
    return cart.map((l) => ({ ...l, platformIssue: null }));
  }
  const label = platformLabelEs(platform);

  return cart.map((l) => {
    if (l.isComboComponent) {
      const inPlatform = priceMap[l.productId]?.[platform] !== undefined;
      return {
        ...l,
        unitPrice: 0,
        platformIssue: inPlatform ? null : `No está dado de alta en ${label}`,
      };
    }

    const extras = l.customizationNames.filter(
      (n) => n !== INCLUDED_IN_COMBO_NOTE && !n.startsWith("½ "),
    );
    const price = priceMap[l.productId]?.[platform];

    let issue: string | null = null;
    if (price === undefined) {
      issue = `No está dado de alta en ${label}`;
    } else if (l.halfFlavors && l.halfFlavors.length > 0) {
      issue = `Mitad y mitad no se vende en ${label}`;
    } else if (extras.length > 0) {
      issue = `${extras.join(", ")}: no aplica en ${label}`;
    }

    return {
      ...l,
      unitPrice: price ?? l.unitPrice,
      platformIssue: issue,
    };
  });
}

export function platformIssueCount(lines: PricedCartLine[]): number {
  return lines.reduce((n, l) => n + (l.platformIssue ? 1 : 0), 0);
}
