import type { CondicionIvaReceptor, TipoComprobante } from "./types";

/**
 * Condición de IVA del receptor (RG 5616) — catálogo y reglas de coherencia con
 * la LETRA del comprobante. Spec 053 (R-C6 del #51).
 *
 * La condición no es libre: depende del tipo de comprobante.
 * - Comprobante **A** (identifica a un inscripto): receptor Responsable
 *   Inscripto (1) o Monotributo (6). Un Consumidor Final / Exento nunca recibe A.
 * - Comprobante **B**: Monotributo (6), Exento (4) o Consumidor Final (5). Un
 *   Responsable Inscripto debe recibir A (para computar el crédito), no B.
 * - **Sin CUIT** (consumidor final sin identificar, doc_tipo 99): la única
 *   condición coherente es Consumidor Final (5).
 *
 * ⚠️ Matriz sujeta a confirmación del contador de golf-house (convención GPSF:
 * los cuadros fiscales los valida el cliente). Los defaults acá son los usuales.
 */

export const CONDICION_IVA_LABEL: Record<CondicionIvaReceptor, string> = {
  1: "Resp. Inscripto",
  4: "Exento",
  5: "Consumidor final",
  6: "Monotributo",
};

function isTipoA(tipo: TipoComprobante): boolean {
  return tipo === "factura_a" || tipo === "nota_credito_a";
}

/** Condiciones válidas para el receptor según la letra del comprobante. El orden
 *  es el de presentación en la UI (el primero es el default sugerido). */
export function condicionesValidasPara(
  tipo: TipoComprobante,
): CondicionIvaReceptor[] {
  return isTipoA(tipo) ? [1, 6] : [6, 4, 5];
}

/** Default sugerido de condición para un comprobante con receptor identificado. */
export function condicionIvaDefault(tipo: TipoComprobante): CondicionIvaReceptor {
  return condicionesValidasPara(tipo)[0];
}

export function esCondicionValidaPara(
  tipo: TipoComprobante,
  condicion: CondicionIvaReceptor,
): boolean {
  return condicionesValidasPara(tipo).includes(condicion);
}
