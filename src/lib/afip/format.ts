import type { InvoiceStatus, TipoComprobante } from "./types";

export function formatInvoiceNumber(pv: number, numero: number): string {
  return `${String(pv).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

const TIPO_LABELS: Record<TipoComprobante, string> = {
  factura_a: "Factura A",
  factura_b: "Factura B",
  nota_credito_a: "NC A",
  nota_credito_b: "NC B",
};

const TIPO_SHORT: Record<TipoComprobante, string> = {
  factura_a: "Fact A",
  factura_b: "Fact B",
  nota_credito_a: "NC A",
  nota_credito_b: "NC B",
};

export function tipoLabel(tipo: TipoComprobante): string {
  return TIPO_LABELS[tipo] ?? tipo;
}

export function tipoShortLabel(tipo: TipoComprobante): string {
  return TIPO_SHORT[tipo] ?? tipo;
}

export type StatusMeta = {
  label: string;
  color: string;
  bg: string;
  dotClass: string;
};

export const INVOICE_STATUS_META: Record<InvoiceStatus, StatusMeta> = {
  authorized: { label: "Autorizada", color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200/60", dotClass: "bg-emerald-500" },
  failed: { label: "Fallida", color: "text-rose-700", bg: "bg-rose-50 ring-rose-200/60", dotClass: "bg-rose-500" },
  pending: { label: "Pendiente", color: "text-amber-700", bg: "bg-amber-50 ring-amber-200/60", dotClass: "bg-amber-500" },
  cancelled: { label: "Anulada", color: "text-zinc-500", bg: "bg-zinc-50 ring-zinc-200/60", dotClass: "bg-zinc-400" },
};
