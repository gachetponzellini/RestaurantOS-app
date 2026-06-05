import type { BusinessRole } from "@/lib/admin/context";
import type { OperationalStatus } from "@/lib/mozo/state-machine";

// ============================================
// Helpers de permisos por rol — Bloque 1 MVP.
//
// Espejo en código de la matriz de permisos en
// `wiki/casos-de-uso/CU-11-matriz-permisos.md`.
//
// Los thresholds (descuento bajo/medio, diferencia de caja) son los defaults
// que pre-llenamos nosotros. **Pendiente validación cliente**: cuando vuelva
// la matriz firmada, se ajustan acá una sola vez.
//
// Si en el futuro hace falta soportar thresholds por business (ej: un local
// quiere autorizar al encargado hasta $10.000 de diferencia), se mueve a
// `business_settings.permissions JSONB` y los helpers cargan los límites en
// runtime. Por ahora, valores fijos.
// ============================================

/** Tope superior (incluyente) del descuento que un mozo puede aplicar solo. */
export const DESCUENTO_BAJO_PCT = 10;

/** Tope superior (incluyente) del descuento que un encargado de caja puede
 *  aplicar solo. Por encima → admin. */
export const DESCUENTO_MEDIO_PCT = 25;

/** Diferencia absoluta máxima de caja (en centavos) que el encargado puede
 *  aceptar en un corte sin escalar a admin. $5.000 ARS por defecto. */
export const DIFERENCIA_CAJA_OK_CENTS = 500_000;

// ── Operación de salón ──────────────────────────────────────────

export function canModifyPostEnvio(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

export function canCancelItem(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

/**
 * Confirmar un pedido entrante (delivery / take-away / web / chatbot) para
 * que pase del estado "pendiente de confirmación" a "preparing" y se ruteen
 * sus items a las comandas de cada sector. Mozo no — está en salón, no
 * tiene visibilidad de la cola de pedidos online.
 */
export function canConfirmOrder(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

export function canMarkRotura(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

// ── Cuenta / cobros ─────────────────────────────────────────────

/**
 * `percent` se espera como porcentaje (0–100), no fracción.
 * Ej: 15 = 15%. Valores negativos siempre false (no es responsabilidad de
 * estos helpers validar dominio numérico — eso lo hace la action).
 */
export function canApplyDiscount(role: BusinessRole, percent: number): boolean {
  if (percent < 0) return false;
  if (role === "admin") return true;
  if (role === "encargado") return percent <= DESCUENTO_MEDIO_PCT;
  if (role === "mozo") return percent <= DESCUENTO_BAJO_PCT;
  return false;
}

// ── Caja / cortes ───────────────────────────────────────────────

export function canManageCajas(role: BusinessRole): boolean {
  return role === "admin";
}

export function canHacerCorte(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

/**
 * Diferencia en centavos. Se evalúa en valor absoluto: una diferencia negativa
 * (faltante) y una positiva (sobrante) se tratan igual para el threshold.
 */
export function canAcceptCajaDifference(
  role: BusinessRole,
  diffCents: number,
): boolean {
  if (role === "admin") return true;
  if (role === "encargado") {
    return Math.abs(diffCents) <= DIFERENCIA_CAJA_OK_CENTS;
  }
  return false;
}

export function canMakeSangria(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

export function canRendirMozo(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

// ── Estados de mesa (CU-07 + CU-11) ─────────────────────────────

/**
 * Permisos sobre transiciones de mesa. Asume que `canTransition(from, to)` ya
 * fue validado por la state machine — esto solo decide si el rol puede
 * disparar esa transición concreta.
 *
 * Regla CU-11: anulación de mesa (ocupada/pidio_cuenta → libre sin cobro) es
 * solo encargado/admin. El cierre normal post-cobro (pidio_cuenta → libre)
 * lo dispara `closeOrderIfFullyPaid` con `byUserId=null` y service client,
 * por lo que no pasa por este check.
 */
export function canTransitionMesa(
  role: BusinessRole,
  from: OperationalStatus,
  to: OperationalStatus,
): boolean {
  const isAnulacion = to === "libre" && from === "ocupada";
  if (isAnulacion) return role === "admin" || role === "encargado";
  return true;
}

// ── Asignación / transferencia de mesa (CU-09) ──────────────────

/**
 * Quién puede transferir una mesa.
 * - admin/encargado: siempre.
 * - mozo: si es el origen (su mesa) O si reclama la mesa para sí mismo
 *   (auto-transfer). Ambos casos generan notificaciones y audit log.
 */
export function canTransferTable(
  role: BusinessRole,
  isOrigen: boolean,
  isSelfClaim: boolean = false,
): boolean {
  if (role === "admin" || role === "encargado") return true;
  if (role === "mozo") return isOrigen || isSelfClaim;
  return false;
}

/**
 * Asignar/cambiar/limpiar el `mozo_id` de una mesa fuera del flujo de
 * transferencia (ej: encargado pre-asigna mesas antes del servicio). Mozo no
 * puede asignar mesas a otros — solo se auto-asigna por walk-in (CU-09 R2).
 */
export function canAssignMozo(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}

// ── Proveedores ────────────────────────────────────────────────

export function canManageProveedores(role: BusinessRole): boolean {
  return role === "admin" || role === "encargado";
}
