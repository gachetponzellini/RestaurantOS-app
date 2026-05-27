/**
 * UI helpers compartidos para renderizar notificaciones (drawer admin,
 * AvisosSection del mozo, futuros toasts). Mantener el switch acá hace que
 * sumar tipos nuevos sea un solo punto de cambio.
 */
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  CheckCircle2,
  ShoppingBag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Notification } from "@/lib/notifications/queries";

export type NotiTone = "info" | "warning" | "success" | "danger";

export type NotiView = {
  tone: NotiTone;
  icon: LucideIcon;
  title: string;
  body: string;
};

export const NOTI_TONE_STYLES: Record<
  NotiTone,
  { iconBg: string; iconText: string; ring: string }
> = {
  info: {
    iconBg: "bg-sky-50",
    iconText: "text-sky-700",
    ring: "ring-sky-200/70",
  },
  warning: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-700",
    ring: "ring-amber-200/70",
  },
  success: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-700",
    ring: "ring-emerald-200/70",
  },
  danger: {
    iconBg: "bg-rose-50",
    iconText: "text-rose-700",
    ring: "ring-rose-200/70",
  },
};

export function viewForNotification(n: Notification): NotiView {
  const p = (n.payload ?? {}) as Record<string, unknown>;

  if (n.type === "mesa.transferred") {
    const tableLabel = (p.tableLabel as string | undefined) ?? "?";
    const fromName = p.fromName as string | null | undefined;
    const toName = p.toName as string | null | undefined;
    return {
      tone: "info",
      icon: ArrowLeftRight,
      title: `Mesa ${tableLabel} transferida`,
      body: [
        fromName ? `De ${fromName}` : null,
        toName ? `a ${toName}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (n.type === "mesa.cancelled") {
    const tableLabel = (p.tableLabel as string | undefined) ?? "?";
    const reason = p.reason as string | undefined;
    return {
      tone: "danger",
      icon: Ban,
      title: `Mesa ${tableLabel} anulada`,
      body: reason ? `Motivo: ${reason}` : "Sin motivo registrado.",
    };
  }
  if (n.type === "order.pending") {
    const num = (p.orderNumber as number | undefined) ?? "?";
    const tipo =
      p.deliveryType === "delivery"
        ? "Delivery"
        : p.deliveryType === "take_away"
          ? "Take-away"
          : "Pedido";
    const customer = (p.customerName as string | undefined) ?? "cliente";
    return {
      tone: "warning",
      icon: ShoppingBag,
      title: `${tipo} nuevo · #${num}`,
      body: `De ${customer}. Falta confirmar.`,
    };
  }
  if (n.type === "comanda.entregada") {
    const tableLabel = (p.tableLabel as string | undefined) ?? "?";
    const stationName = (p.stationName as string | undefined) ?? "Cocina";
    const itemCount = (p.itemCount as number | undefined) ?? 0;
    return {
      tone: "success",
      icon: CheckCircle2,
      title: `Comanda lista · Mesa ${tableLabel}`,
      body: `${stationName} — ${itemCount} plato(s) para servir`,
    };
  }

  return {
    tone: "info",
    icon: AlertTriangle,
    title: n.type,
    body: "Notificación.",
  };
}

/**
 * "ahora", "5 min", "1h 20", "2 h", "3 d" — mismo formato que el salón /
 * comandas kanban / cards para unificar el lenguaje de tiempos.
 */
export function formatNotificationTime(iso: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours}h ${rest}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} d`;
}
