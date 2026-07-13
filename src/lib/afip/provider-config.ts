import type { AFIPConfig, GatewayCredentials } from "./types";

/**
 * Resolución del provider de emisión a partir de la config fiscal del negocio.
 *
 * - En `sandbox` (o producción no habilitada) se emite con el cliente sandbox
 *   (CAEs fake, sin valor fiscal).
 * - En `producción` habilitada se emite contra el **ARCA GPSF Gateway** usando
 *   la credencial del negocio. Si falta, se devuelve error y NO se llama al
 *   gateway.
 */
export type ProviderSelection =
  | { kind: "sandbox" }
  | { kind: "gateway"; credentials: GatewayCredentials }
  | { kind: "error"; message: string };

export const MISSING_CREDENTIALS_MESSAGE =
  "Falta la credencial del gateway ARCA del negocio.";

/** True si el negocio tiene la API key + slug del gateway cargados. */
export function hasRealCredentials(
  credentials: GatewayCredentials | null,
): boolean {
  return Boolean(
    credentials &&
      credentials.apiKey &&
      credentials.tenantSlug &&
      credentials.baseUrl,
  );
}

/** Decide con qué provider emitir según el modo fiscal del negocio. */
export function selectProvider(config: AFIPConfig): ProviderSelection {
  const isProduction = config.mode === "produccion" && config.enabled;
  if (!isProduction) return { kind: "sandbox" };

  if (!hasRealCredentials(config.credentials)) {
    return { kind: "error", message: MISSING_CREDENTIALS_MESSAGE };
  }
  return { kind: "gateway", credentials: config.credentials! };
}
