export type TipoComprobante =
  | "factura_a"
  | "factura_b"
  | "nota_credito_a"
  | "nota_credito_b";

export type InvoiceStatus = "pending" | "authorized" | "failed" | "cancelled";

export type AFIPProvider = "tusfacturas" | "afipsdk" | "direct" | "sandbox";

export type AFIPConfig = {
  cuit: string;
  puntoVenta: number;
  provider: AFIPProvider;
  defaultTipo: TipoComprobante;
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
  numero: number;
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
  pdf_url: string | null;
  provider: string;
  provider_response: unknown;
  created_at: string;
};
