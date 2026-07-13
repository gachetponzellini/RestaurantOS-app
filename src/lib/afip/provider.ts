import type { InvoiceRequest, ProviderResult } from "./types";

/**
 * Contrato de un provider de emisión (asíncrono).
 *
 * El flujo es en dos pasos:
 * 1. `enqueue` encola la emisión. El gateway devuelve `state: "pending"` con un
 *    `jobId`; el sandbox devuelve directamente `state: "authorized"` (terminal).
 * 2. `getStatus` consulta un job encolado (polling), hasta que queda `authorized`
 *    o `failed`.
 */
export interface AFIPProviderClient {
  enqueue(
    req: InvoiceRequest,
    idempotencyKey: string,
  ): Promise<ProviderResult>;
  getStatus(jobId: string): Promise<ProviderResult>;
}
