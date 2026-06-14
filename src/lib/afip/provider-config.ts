import type { AFIPConfig, TusfacturasCredentials } from "./types";

/**
 * Resolución del provider de emisión a partir de la config fiscal del negocio.
 *
 * - En `sandbox` (o producción no habilitada) se emite con el cliente sandbox
 *   (CAEs fake, sin valor fiscal).
 * - En `producción` habilitada se emite con TusFacturas usando las credenciales
 *   del negocio. Si faltan, se devuelve error y NO se llama al provider externo.
 */
export type ProviderSelection =
  | { kind: "sandbox" }
  | { kind: "tusfacturas"; credentials: TusfacturasCredentials }
  | { kind: "error"; message: string };

export const MISSING_CREDENTIALS_MESSAGE =
  "Faltan credenciales fiscales del negocio.";

/** True si el negocio tiene los tres tokens de TusFacturas cargados. */
export function hasRealCredentials(
  credentials: TusfacturasCredentials | null,
): boolean {
  return Boolean(
    credentials &&
      credentials.apiToken &&
      credentials.apiKey &&
      credentials.userToken,
  );
}

/** Decide con qué provider emitir según el modo fiscal del negocio. */
export function selectProvider(config: AFIPConfig): ProviderSelection {
  const isProduction = config.mode === "produccion" && config.enabled;
  if (!isProduction) return { kind: "sandbox" };

  if (!hasRealCredentials(config.credentials)) {
    return { kind: "error", message: MISSING_CREDENTIALS_MESSAGE };
  }
  return { kind: "tusfacturas", credentials: config.credentials! };
}
