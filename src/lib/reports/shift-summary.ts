import { formatInTimeZone } from "date-fns-tz";

import { formatCurrency } from "@/lib/currency";
import type { PaymentMethod } from "@/lib/caja/types";

// ════════════════════════════════════════════════════════════════════════
// Resumen de cierre de turno (spec 34) — COMPOSICIÓN PURA.
//
// `buildShiftSummary` toma los datos ya agregados por las fuentes existentes
// (caja, AFIP, reportes, rendiciones) y los mapea a las secciones del mail,
// formateando montos en ARS y horas en timezone AR. NO recalcula totales: los
// montos salen de las mismas fuentes que ve el dueño en caja/AFIP, así no
// divergen. Es pura y testeable con fixtures — el loader (impuro, service
// client) vive aparte en `shift-summary-loader.ts`.
// ════════════════════════════════════════════════════════════════════════

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card_manual: "Tarjeta",
  mp_link: "Mercado Pago (link)",
  mp_qr: "Mercado Pago (QR)",
  transfer: "Transferencia",
  other: "Otro",
};

const METHOD_ORDER: PaymentMethod[] = [
  "cash",
  "card_manual",
  "mp_qr",
  "mp_link",
  "transfer",
  "other",
];

// ── Datos de entrada (agregados crudos) ─────────────────────────────────

export type CancellationKind = "mesa" | "item" | "factura";

export type CancellationRow = {
  kind: CancellationKind;
  /** Qué se anuló: "Mesa 5", "Milanesa napolitana", "Factura B 0001-00000123". */
  label: string;
  reason: string | null;
  /** Nombre resuelto del responsable, o null si no se pudo (→ "—"). */
  responsable: string | null;
  at: string; // ISO
};

export type ShiftCorte = {
  caja_name: string;
  encargado_name: string | null;
  difference_cents: number;
  closing_cash_cents: number;
  expected_cash_cents: number;
  at: string; // ISO
};

export type ShiftMozo = {
  mozo_name: string;
  ventas_cents: number;
  propinas_cents: number;
  cobros_count: number;
};

export type ShiftSummaryData = {
  businessName: string;
  timezone: string;
  /** Etiqueta del rango ya formateada por el loader (ej. "sábado 28/06/2026"). */
  rangeLabel: string;
  recaudacion: {
    total_cents: number;
    propinas_cents: number;
    por_metodo: Record<PaymentMethod, number>;
    cobros_count: number;
  };
  afip: {
    totalCents: number;
    count: number;
    countA: number;
    countB: number;
    countFailed: number;
    countPending: number;
  };
  operacion: {
    orderCount: number;
    revenueCents: number;
    averageTicketCents: number;
    deliveryCount: number;
    pickupCount: number;
    dineInCount: number;
    cancelledCount: number;
  };
  cortes: ShiftCorte[];
  porMozo: ShiftMozo[];
  anulaciones: CancellationRow[];
};

// ── Modelo de vista (formateado, listo para el template) ────────────────

export type MetodoLine = { label: string; value: string };

export type ShiftSummary = {
  businessName: string;
  rangeLabel: string;
  recaudacion: {
    total: string;
    propinas: string;
    cobros: number;
    porMetodo: MetodoLine[];
  };
  facturacion: {
    total: string;
    comprobantes: number;
    desglose: string;
    pendientes: number;
    fallidos: number;
  };
  operacion: {
    pedidos: number;
    ticketPromedio: string;
    delivery: number;
    pickup: number;
    /** Mesas atendidas (dine-in). MVP: aproxima "cubiertos" — el nº de
     *  comensales no se captura hoy por orden. Ver design D5. */
    mesas: number;
    cancelados: number;
  };
  caja: {
    cortes: {
      caja: string;
      encargado: string;
      diferencia: string;
      hora: string;
    }[];
    diferenciaTotal: string;
  };
  porMozo: { mozo: string; ventas: string; propinas: string }[];
  anulaciones: {
    detalle: string;
    motivo: string;
    responsable: string;
    hora: string;
  }[];
  /** False si el día no tuvo movimiento (recaudación, pedidos ni cortes). */
  hasData: boolean;
};

function fmtHora(iso: string, timezone: string): string {
  try {
    return formatInTimeZone(new Date(iso), timezone, "HH:mm");
  } catch {
    return "—";
  }
}

/**
 * Compone el `ShiftSummary` (vista formateada) a partir de los datos agregados.
 * Pura: mismo input → mismo output; no toca la red ni `new Date()` para el
 * rango (eso lo hace el loader).
 */
export function buildShiftSummary(data: ShiftSummaryData): ShiftSummary {
  const { recaudacion, afip, operacion, cortes, porMozo, anulaciones } = data;

  const porMetodo: MetodoLine[] = METHOD_ORDER.filter(
    (m) => (recaudacion.por_metodo[m] ?? 0) > 0,
  ).map((m) => ({
    label: PAYMENT_METHOD_LABELS[m],
    value: formatCurrency(recaudacion.por_metodo[m] ?? 0),
  }));

  const diferenciaTotalCents = cortes.reduce(
    (acc, c) => acc + c.difference_cents,
    0,
  );

  const hasData =
    recaudacion.total_cents > 0 ||
    operacion.orderCount > 0 ||
    cortes.length > 0 ||
    afip.count > 0;

  return {
    businessName: data.businessName,
    rangeLabel: data.rangeLabel,
    recaudacion: {
      total: formatCurrency(recaudacion.total_cents),
      propinas: formatCurrency(recaudacion.propinas_cents),
      cobros: recaudacion.cobros_count,
      porMetodo,
    },
    facturacion: {
      total: formatCurrency(afip.totalCents),
      comprobantes: afip.count,
      desglose: `A: ${afip.countA} · B: ${afip.countB}`,
      pendientes: afip.countPending,
      fallidos: afip.countFailed,
    },
    operacion: {
      pedidos: operacion.orderCount,
      ticketPromedio: formatCurrency(operacion.averageTicketCents),
      delivery: operacion.deliveryCount,
      pickup: operacion.pickupCount,
      mesas: operacion.dineInCount,
      cancelados: operacion.cancelledCount,
    },
    caja: {
      cortes: cortes.map((c) => ({
        caja: c.caja_name,
        encargado: c.encargado_name ?? "—",
        diferencia: formatCurrency(c.difference_cents),
        hora: fmtHora(c.at, data.timezone),
      })),
      diferenciaTotal: formatCurrency(diferenciaTotalCents),
    },
    porMozo: porMozo.map((m) => ({
      mozo: m.mozo_name,
      ventas: formatCurrency(m.ventas_cents),
      propinas: formatCurrency(m.propinas_cents),
    })),
    anulaciones: anulaciones.map((a) => ({
      detalle: a.label,
      motivo: a.reason?.trim() ? a.reason.trim() : "—",
      responsable: a.responsable?.trim() ? a.responsable.trim() : "—",
      hora: fmtHora(a.at, data.timezone),
    })),
    hasData,
  };
}
