export type TipoComprobante =
  | "factura_a"
  | "factura_b"
  | "nota_credito_a"
  | "nota_credito_b";

export type InvoiceStatus = "pending" | "authorized" | "failed" | "cancelled";

export type AFIPProvider = "tusfacturas" | "afipsdk" | "direct" | "sandbox";

/** Modo fiscal por negocio. En `sandbox` los CAEs son fake (sin valor fiscal). */
export type FiscalMode = "sandbox" | "produccion";

/**
 * Credenciales de TusFacturas, resueltas POR NEGOCIO (server-only).
 * Son tres tokens; el CUIT emisor lo determina la credencial, no se envía
 * en el payload. Nunca se exponen al cliente.
 */
export type TusfacturasCredentials = {
  apiToken: string;
  apiKey: string;
  userToken: string;
  apiUrl?: string;
};

export type AFIPConfig = {
  cuit: string;
  puntoVenta: number;
  provider: AFIPProvider;
  defaultTipo: TipoComprobante;
  mode: FiscalMode;
  enabled: boolean;
  /** null cuando el negocio todavía no cargó las credenciales reales. */
  credentials: TusfacturasCredentials | null;
};

export type InvoiceRequest = {
  tipo: TipoComprobante;
  puntoVenta: number;
  cuitEmisor: string;
  cuitReceptor?: string;
  razonSocialReceptor?: string;
  totalCents: number;
  concepto: "productos" | "servicios" | "productos_y_servicios";
};

export type InvoiceResponse = {
  success: boolean;
  cae?: string;
  caeVencimiento?: string;
  numero?: number;
  error?: string;
  rawResponse?: unknown;
};

export type Invoice = {
  id: string;
  business_id: string;
  order_id: string | null;
  payment_id: string | null;
  tipo_comprobante: TipoComprobante;
  punto_venta: number;
  numero: number | null;
  cae: string | null;
  cae_vencimiento: string | null;
  cuit_receptor: string | null;
  razon_social_receptor: string | null;
  total_cents: number;
  neto_cents: number;
  iva_cents: number;
  iva_rate: number;
  status: InvoiceStatus;
  error_message: string | null;
  idempotency_key: string | null;
  pdf_url: string | null;
  provider: string;
  provider_response: unknown;
  created_at: string;
  /** Motivo de anulación (presente cuando `status = 'cancelled'`). */
  cancelled_reason: string | null;
  /** Si la fila ES una nota de crédito, apunta a la factura que anula. */
  cancels_invoice_id: string | null;
};
