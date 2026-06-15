// ============================================
// Alertas automáticas de "Mis locales" (spec 14, bloque 6).
//
// Lógica pura sobre datos ya calculados por local. Le dicen al dueño DÓNDE
// mirar sin leer todos los gráficos. Umbrales centralizados acá.
// ============================================

export const ALERT_THRESHOLDS = {
  /** Caída de ingresos vs período anterior que dispara aviso (porcentaje). */
  revenueDropPct: -15,
  /** Promedio de cocina (min) que se considera lento. */
  kitchenSlowMin: 30,
  /** Muestra mínima de tickets de cocina para que el promedio sea confiable. */
  kitchenMinSample: 10,
  /** Tasa de asistencia (%) por debajo de la cual se avisa. */
  attendanceLowPct: 70,
  /** Reservas finalizadas mínimas para evaluar la tasa de asistencia. */
  reservationsMinSample: 5,
};

export type LocalAlertInput = {
  name: string;
  /** Δ% de ingresos vs período anterior (null si no hay base previa). */
  revenuePct: number | null;
  kitchenAvgMin: number;
  kitchenSample: number;
  noShow: number;
  /** Tasa de asistencia 0–100 (null si no hubo reservas). */
  attendanceRate: number | null;
  reservationsFinalized: number;
};

export type Alert = {
  severity: "warning" | "info";
  localName: string;
  message: string;
  kind: "revenue_drop" | "kitchen_slow" | "no_shows";
};

/** Construye la lista de alertas a partir de los datos por local. */
export function buildAlerts(locals: LocalAlertInput[]): Alert[] {
  const alerts: Alert[] = [];

  for (const l of locals) {
    if (l.revenuePct !== null && l.revenuePct <= ALERT_THRESHOLDS.revenueDropPct) {
      alerts.push({
        severity: "warning",
        localName: l.name,
        kind: "revenue_drop",
        message: `Ventas de ${l.name} cayeron ${Math.abs(Math.round(l.revenuePct))}% vs el período anterior.`,
      });
    }

    if (
      l.kitchenSample >= ALERT_THRESHOLDS.kitchenMinSample &&
      l.kitchenAvgMin >= ALERT_THRESHOLDS.kitchenSlowMin
    ) {
      alerts.push({
        severity: "warning",
        localName: l.name,
        kind: "kitchen_slow",
        message: `Cocina de ${l.name} promedia ${Math.round(l.kitchenAvgMin)} min de preparación.`,
      });
    }

    if (
      l.reservationsFinalized >= ALERT_THRESHOLDS.reservationsMinSample &&
      l.attendanceRate !== null &&
      l.attendanceRate < ALERT_THRESHOLDS.attendanceLowPct
    ) {
      alerts.push({
        severity: "warning",
        localName: l.name,
        kind: "no_shows",
        message: `${l.name}: ${l.noShow} no-shows (${Math.round(l.attendanceRate)}% de asistencia).`,
      });
    }
  }

  return alerts;
}
