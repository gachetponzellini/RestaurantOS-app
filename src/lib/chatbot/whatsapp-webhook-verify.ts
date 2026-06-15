/**
 * Verificación de firma de webhooks entrantes de WhatsApp (Meta Cloud API /
 * 360dialog). Lógica pura, sin red ni acceso a DB: recibe el app secret por
 * parámetro y **nunca lo emite**. La ruta entrante (cambio futuro) la usa para
 * rechazar *fail-closed* cualquier payload sin firma válida antes de procesarlo.
 *
 * Meta firma el body crudo con HMAC-SHA256 usando el App Secret del negocio y
 * manda el resultado en el header `X-Hub-Signature-256: sha256=<hex>`. La
 * verificación tiene que correr sobre el body **crudo** (req.text()), no sobre
 * el JSON re-serializado.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappSignature(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  appSecret: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = input;
  // Fail-closed: sin header o sin secreto, no se valida nada.
  if (!signatureHeader || !appSecret) return false;

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length).trim();
  // Sólo hex válido; cualquier basura → false sin tocar crypto.
  if (provided.length === 0 || !/^[0-9a-f]+$/i.test(provided)) return false;

  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Comparación timing-safe. Longitudes distintas → false sin lanzar.
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
