import type { AFIPProviderClient } from "./provider";
import type {
  InvoiceRequest,
  InvoiceResponse,
  TusfacturasCredentials,
} from "./types";

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

const DEFAULT_API_URL = "https://app.tusfacturas.app/api/v2";

/**
 * Cliente de TusFacturas resuelto POR NEGOCIO.
 *
 * Recibe las tres credenciales del negocio (apitoken, apikey, usertoken) en vez
 * de leerlas de env global, de modo que House y Golf (CUIT distintos) facturen
 * cada uno con su propia cuenta. El CUIT emisor lo determina la credencial: no
 * se envía en el payload.
 */
export function createTusfacturasClient(
  creds: TusfacturasCredentials,
): AFIPProviderClient {
  const apiUrl = (creds.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  return {
    emit: (req) => emit(req, creds, apiUrl),
    getLastNumber: (tipo, pv) => getLastNumber(tipo, pv, creds, apiUrl),
  };
}

/** Cabecera de autenticación común a todos los requests v2 de TusFacturas. */
function authHeader(creds: TusfacturasCredentials) {
  return {
    apitoken: creds.apiToken,
    apikey: creds.apiKey,
    usertoken: creds.userToken,
  };
}

async function emit(
  req: InvoiceRequest,
  creds: TusfacturasCredentials,
  apiUrl: string,
): Promise<InvoiceResponse> {
  const totalPesos = req.totalCents / 100;
  const divisor = 1 + 21 / 100;
  const netoPesos = Math.round((totalPesos / divisor) * 100) / 100;
  const ivaPesos = Math.round((totalPesos - netoPesos) * 100) / 100;

  const body = {
    ...authHeader(creds),
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
  creds: TusfacturasCredentials,
  apiUrl: string,
): Promise<number> {
  const tipo = TIPO_MAP[tipoComprobante] ?? 6;

  const res = await fetch(`${apiUrl}/facturacion/ultimo_comprobante`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...authHeader(creds),
      comprobante: { tipo, punto_venta: puntoVenta },
    }),
  });

  if (!res.ok) return 0;
  const data = (await res.json()) as Record<string, unknown>;
  return (data.ultimo_comprobante as number) ?? 0;
}
