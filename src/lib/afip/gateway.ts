import type { AFIPProviderClient } from "./provider";
import { buildGatewayInvoiceBody } from "./gateway-payload";
import type {
  GatewayCredentials,
  InvoiceRequest,
  ProviderErrorType,
  ProviderResult,
} from "./types";

const DEFAULT_BASE_URL = "https://arca-gpsf-gateway.vercel.app";

/**
 * Cliente del **ARCA GPSF Gateway** resuelto POR NEGOCIO.
 *
 * El gateway es asíncrono: `enqueue` hace `POST /api/t/<slug>/v1/invoices` con la
 * `Idempotency-Key` y recibe `202 { job_id }` (estado `pending`); `getStatus`
 * hace `GET .../invoices/{job_id}` y devuelve el CAE cuando el worker resolvió.
 * La app nunca ve el formato de ARCA (WSFEv1): manda nuestro JSON y recibe el
 * nuestro.
 */
export function createGatewayClient(
  creds: GatewayCredentials,
): AFIPProviderClient {
  const baseUrl = (creds.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const tenantBase = `${baseUrl}/api/t/${creds.tenantSlug}/v1`;
  return {
    enqueue: (req, key) => enqueue(req, key, creds.apiKey, tenantBase),
    getStatus: (jobId) => getStatus(jobId, creds.apiKey, tenantBase),
  };
}

/** Mapea el `type` de error del gateway (o el HTTP) a nuestra clasificación. */
function mapErrorType(
  gatewayType: unknown,
  httpStatus: number,
): ProviderErrorType {
  if (gatewayType === "validation") return "validation";
  if (gatewayType === "arca_down") return "arca_down";
  if (gatewayType === "auth") return "auth";
  if (gatewayType === "not_found") return "not_found";
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 400 || httpStatus === 409) return "validation";
  return "unknown";
}

async function enqueue(
  req: InvoiceRequest,
  idempotencyKey: string,
  apiKey: string,
  tenantBase: string,
): Promise<ProviderResult> {
  let res: Response;
  try {
    res = await fetch(`${tenantBase}/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(buildGatewayInvoiceBody(req)),
    });
  } catch (err) {
    // No se pudo encolar (red). Transitorio: reintentar con la MISMA key es seguro
    // (el gateway deduplica por Idempotency-Key). No hay job todavía.
    return {
      success: false,
      state: "failed",
      errorType: "arca_down",
      error: `No se pudo conectar con el gateway: ${errMsg(err)}`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  // 202 = encolado OK. También toleramos 200/201 defensivamente.
  if (res.status === 202 || res.status === 200 || res.status === 201) {
    return {
      success: true,
      state: "pending",
      jobId: typeof data.job_id === "string" ? data.job_id : undefined,
      rawResponse: data,
    };
  }

  const gwError = (data.error ?? {}) as Record<string, unknown>;
  return {
    success: false,
    state: "failed",
    error:
      (gwError.message as string) ??
      `El gateway rechazó el comprobante (HTTP ${res.status}).`,
    errorType: mapErrorType(gwError.type, res.status),
    rawResponse: data,
  };
}

async function getStatus(
  jobId: string,
  apiKey: string,
  tenantBase: string,
): Promise<ProviderResult> {
  let res: Response;
  try {
    res = await fetch(`${tenantBase}/invoices/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    // Error de red consultando: no es terminal, seguimos polleando.
    return {
      success: false,
      state: "pending",
      jobId,
      error: `Error consultando el estado: ${errMsg(err)}`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    // 404 = job inexistente (terminal, no reintenta). Otros HTTP: transitorio.
    const terminal = res.status === 404;
    return {
      success: false,
      state: terminal ? "failed" : "pending",
      jobId,
      error:
        ((data.error as Record<string, unknown>)?.message as string) ??
        `HTTP ${res.status} consultando el estado.`,
      errorType: mapErrorType(undefined, res.status),
      rawResponse: data,
    };
  }

  const status = data.status as string | undefined;

  if (status === "emitted") {
    return {
      success: true,
      state: "authorized",
      jobId,
      cae: data.cae as string,
      caeVencimiento: data.cae_vto as string,
      numero:
        typeof data.nro_comprobante === "number"
          ? data.nro_comprobante
          : undefined,
      qrUrl: data.qr_url as string | undefined,
      rawResponse: data,
    };
  }

  if (status === "error") {
    return {
      success: false,
      state: "failed",
      jobId,
      error:
        (data.error_detail as string) ??
        "ARCA rechazó el comprobante (dato inválido).",
      errorType: mapErrorType(data.error_type, 200),
      rawResponse: data,
    };
  }

  // pending | retrying → seguí polleando.
  return { success: true, state: "pending", jobId, rawResponse: data };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
