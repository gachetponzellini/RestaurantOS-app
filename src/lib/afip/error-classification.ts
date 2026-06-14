/**
 * Clasificación de errores del provider de facturación.
 *
 * ARCA distingue entre un **rechazo fiscal definitivo** (datos del comprobante
 * mal: CUIT inválido, comprobante mal formado → corregir antes de reintentar) y
 * un **error transitorio** de red/HTTP (timeout, 5xx → reintentar tal cual).
 * Reintentar a ciegas un rechazo fiscal no sirve; reintentar un transitorio sí.
 */

export type ErrorClass = "transient" | "fiscal" | "unknown";

/** Decide si un error de emisión es transitorio, fiscal o indeterminado. */
export function classifyProviderError(
  error: string | null | undefined,
): ErrorClass {
  if (!error) return "unknown";
  const e = error.toLowerCase();

  // Transitorio: red / HTTP 5xx / 408 / 429 / timeouts / conexión caída.
  if (
    /http\s*(5\d\d|408|429)/.test(e) ||
    /\b(502|503|504)\b/.test(e) ||
    e.includes("timeout") ||
    e.includes("timed out") ||
    e.includes("econn") ||
    e.includes("network") ||
    e.includes("fetch failed") ||
    e.includes("socket") ||
    e.includes("temporar")
  ) {
    return "transient";
  }

  // Rechazo fiscal: validaciones de ARCA / datos del comprobante / HTTP 4xx.
  if (
    e.includes("cuit") ||
    e.includes("cae") ||
    e.includes("comprobante") ||
    e.includes("rechaz") ||
    e.includes("inválid") ||
    e.includes("invalid") ||
    e.includes("afip") ||
    e.includes("arca") ||
    e.includes("receptor") ||
    /http\s*4\d\d/.test(e)
  ) {
    return "fiscal";
  }

  return "unknown";
}

/**
 * Un error es reintentable salvo que sea un rechazo fiscal definitivo.
 * Los indeterminados se permiten reintentar (el usuario decide).
 */
export function isRetriable(error: string | null | undefined): boolean {
  return classifyProviderError(error) !== "fiscal";
}
