import type { InvoiceRequest, InvoiceResponse } from "./types";

export interface AFIPProviderClient {
  emit(req: InvoiceRequest): Promise<InvoiceResponse>;
  getLastNumber(tipoComprobante: string, puntoVenta: number): Promise<number>;
}
