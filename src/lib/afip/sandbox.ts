import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type { AFIPProviderClient } from "./provider";
import type { InvoiceRequest, ProviderResult } from "./types";

type GenericClient = SupabaseClient;

/**
 * Provider sandbox para testing local. Simula respuestas de AFIP sin llamar a
 * ninguna API externa. A diferencia del gateway (asíncrono), el sandbox resuelve
 * de una: `enqueue` ya devuelve `state: "authorized"` (terminal), así que no se
 * pollea. Devuelve CAEs fake y números secuenciales leídos de la DB.
 */
export function createSandboxClient(businessId: string): AFIPProviderClient {
  return {
    enqueue: (req) => enqueue(req, businessId),
    // El sandbox nunca queda pending, así que getStatus no debería llamarse.
    // Se deja por contrato: devuelve un terminal benigno.
    getStatus: async (jobId) => ({ success: true, state: "authorized", jobId }),
  };
}

const TIPO_LABEL: Record<string, string> = {
  factura_a: "FA",
  factura_b: "FB",
  nota_credito_a: "NCA",
  nota_credito_b: "NCB",
};

async function enqueue(
  req: InvoiceRequest,
  businessId: string,
): Promise<ProviderResult> {
  // Simular latencia de red (~300-600ms)
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));

  const lastNum = await getLastNumber(req.tipo, req.puntoVenta, businessId);
  const numero = lastNum + 1;

  const now = Date.now();
  const vencimiento = new Date(now + 10 * 24 * 60 * 60 * 1000); // +10 días
  const vencStr = vencimiento.toISOString().slice(0, 10); // YYYY-MM-DD

  const tipoTag = TIPO_LABEL[req.tipo] ?? "XX";

  return {
    success: true,
    state: "authorized",
    jobId: `sandbox:${numero}`,
    cae: `SANDBOX-${tipoTag}-${now}`,
    caeVencimiento: vencStr,
    numero,
    rawResponse: {
      sandbox: true,
      emittedAt: new Date().toISOString(),
      nota: "Comprobante de prueba — no válido fiscalmente.",
    },
  };
}

async function getLastNumber(
  tipoComprobante: string,
  puntoVenta: number,
  businessId: string,
): Promise<number> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  // Cuentan todos los comprobantes que YA tomaron número (numero != NULL): los
  // pending/failed tienen numero = NULL y se excluyen, pero los `cancelled`
  // (anulados con su nota de crédito) conservan el número fiscal que
  // consumieron — anular no libera el correlativo. Filtrar sólo `authorized`
  // reusaría el número de una factura anulada y chocaría con el unique
  // (business, tipo, pv, numero).
  const { data } = await service
    .from("invoices")
    .select("numero")
    .eq("business_id", businessId)
    .eq("tipo_comprobante", tipoComprobante)
    .eq("punto_venta", puntoVenta)
    .not("numero", "is", null)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { numero: number } | null)?.numero ?? 0;
}
