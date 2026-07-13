import { pollInvoiceStatus } from "./emit-invoice";
import type { Invoice } from "./types";

type WaitOptions = {
  /** Se llama con cada snapshot de la factura (incluye estados intermedios). */
  onUpdate?: (invoice: Invoice) => void;
  intervalMs?: number;
  timeoutMs?: number;
};

/**
 * Pollea `pollInvoiceStatus` hasta que la factura queda terminal
 * (`authorized`/`failed`/`cancelled`) o se agota el timeout. Pensado para la UI:
 * después de encolar una emisión, el componente llama a esto para esperar el CAE.
 *
 * Devuelve la factura terminal, o la última conocida (todavía `pending`) si se
 * agotó el tiempo. Devuelve `null` si el polling falló (sin permisos, etc.).
 */
export async function waitForInvoiceTerminal(
  invoiceId: string,
  slug: string,
  opts: WaitOptions = {},
): Promise<Invoice | null> {
  const interval = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);

  let last: Invoice | null = null;
  while (Date.now() < deadline) {
    const r = await pollInvoiceStatus(invoiceId, slug);
    if (!r.ok) return last;
    last = r.data.invoice;
    opts.onUpdate?.(last);
    if (last.status !== "pending") return last;
    await new Promise((res) => setTimeout(res, interval));
  }
  return last;
}
