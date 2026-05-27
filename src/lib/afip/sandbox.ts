import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type { AFIPProviderClient } from "./provider";
import type { InvoiceRequest, InvoiceResponse } from "./types";

// The invoices table was added in migration 0048 but Supabase types haven't
// been regenerated yet, so we use a generic client to bypass the typed schema.
type GenericClient = SupabaseClient;

/**
 * Provider sandbox para testing local.
 * Simula respuestas de AFIP sin llamar a ninguna API externa.
 * Devuelve CAEs fake y números secuenciales leídos de la DB.
 */
export function createSandboxClient(businessId: string): AFIPProviderClient {
  return {
    emit: (req) => emit(req, businessId),
    getLastNumber: (tipo, pv) => getLastNumber(tipo, pv, businessId),
  };
}

const TIPO_LABEL: Record<string, string> = {
  factura_a: "FA",
  factura_b: "FB",
  nota_credito_a: "NCA",
  nota_credito_b: "NCB",
};

async function emit(
  req: InvoiceRequest,
  businessId: string,
): Promise<InvoiceResponse> {
  // Simular latencia de red (~300-600ms)
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));

  const lastNum = await getLastNumber(
    req.tipo,
    req.puntoVenta,
    businessId,
  );
  const numero = lastNum + 1;

  const now = Date.now();
  const vencimiento = new Date(now + 10 * 24 * 60 * 60 * 1000); // +10 días
  const vencStr = vencimiento.toISOString().slice(0, 10); // YYYY-MM-DD

  const tipoTag = TIPO_LABEL[req.tipo] ?? "XX";

  return {
    success: true,
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
  const { data } = await service
    .from("invoices")
    .select("numero")
    .eq("business_id", businessId)
    .eq("tipo_comprobante", tipoComprobante)
    .eq("punto_venta", puntoVenta)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { numero: number } | null)?.numero ?? 0;
}
