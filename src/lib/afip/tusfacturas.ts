import type { AFIPProviderClient } from "./provider";
import type { InvoiceRequest, InvoiceResponse } from "./types";

const TIPO_MAP: Record<string, number> = {
  factura_a: 1,
  factura_b: 6,
  nota_credito_a: 3,
  nota_credito_b: 8,
};

const CONCEPTO_MAP: Record<string, number> = {
  productos: 1,
  servicios: 2,
  productos_y_servicios: 3,
};

function getEnv(): { apiKey: string; apiUrl: string } {
  const apiKey = process.env.TUSFACTURAS_API_KEY;
  const apiUrl =
    process.env.TUSFACTURAS_API_URL ?? "https://app.tusfacturas.app/api/v2/";
  if (!apiKey) throw new Error("TUSFACTURAS_API_KEY no configurada");
  return { apiKey, apiUrl: apiUrl.replace(/\/$/, "") };
}

export function createTusfacturasClient(): AFIPProviderClient {
  return { emit, getLastNumber };
}

async function emit(req: InvoiceRequest): Promise<InvoiceResponse> {
  const { apiKey, apiUrl } = getEnv();

  const totalPesos = req.totalCents / 100;
  const divisor = 1 + 21 / 100;
  const netoPesos = Math.round((totalPesos / divisor) * 100) / 100;
  const ivaPesos = Math.round((totalPesos - netoPesos) * 100) / 100;

  const body = {
    apikey: apiKey,
    comprobante: {
      tipo: TIPO_MAP[req.tipo] ?? 6,
      operacion: "V",
      punto_venta: req.puntoVenta,
      concepto: CONCEPTO_MAP[req.concepto] ?? 1,
      moneda: "PES",
      cotizacion: 1,
      importe_total: totalPesos,
      importe_neto: netoPesos,
      importe_iva: ivaPesos,
      importe_exento: 0,
      importe_no_gravado: 0,
      ...(req.cuitReceptor
        ? {
            documento_tipo: "CUIT",
            documento_nro: req.cuitReceptor,
          }
        : {
            documento_tipo: "DNI",
            documento_nro: "",
          }),
    },
    cliente: req.razonSocialReceptor
      ? { razon_social: req.razonSocialReceptor, cuit: req.cuitReceptor }
      : undefined,
  };

  const res = await fetch(`${apiUrl}/facturacion/nuevo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Tusfacturas HTTP ${res.status}: ${res.statusText}`,
      rawResponse: await res.text(),
    };
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (data.error && data.error !== "N") {
    return {
      success: false,
      error: (data.errores as string) ?? "Error desconocido de Tusfacturas",
      rawResponse: data,
    };
  }

  return {
    success: true,
    cae: data.cae as string,
    caeVencimiento: data.vencimiento_cae as string,
    numero: data.comprobante_nro as number,
    rawResponse: data,
  };
}

async function getLastNumber(
  tipoComprobante: string,
  puntoVenta: number,
): Promise<number> {
  const { apiKey, apiUrl } = getEnv();
  const tipo = TIPO_MAP[tipoComprobante] ?? 6;

  const res = await fetch(`${apiUrl}/facturacion/ultimo_comprobante`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      comprobante: { tipo, punto_venta: puntoVenta },
    }),
  });

  if (!res.ok) return 0;
  const data = (await res.json()) as Record<string, unknown>;
  return (data.ultimo_comprobante as number) ?? 0;
}
