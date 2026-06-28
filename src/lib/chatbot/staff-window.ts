// Ventana de servicio de WhatsApp (24 h) — lógica pura, sin I/O.
//
// Meta/WhatsApp sólo admite **texto libre** dentro de las 24 h posteriores al
// último mensaje *entrante del cliente* (customer service window). Fuera de esa
// ventana hay que usar un template aprobado. Para la escritura manual del staff
// (spec 32) calculamos la ventana ANTES de habilitar la caja, en vez de dejar
// que el envío falle en 360dialog. Reabren la ventana sólo los mensajes del
// cliente (`role: 'user'`); los del bot o del staff (`role: 'assistant'`) no.

export const WHATSAPP_WINDOW_HOURS = 24;

const WINDOW_MS = WHATSAPP_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * ¿Está abierta la ventana de 24 h dado el último mensaje entrante del cliente?
 *
 * `true` sólo si hubo un inbound y pasaron **menos** de 24 h. El borde exacto
 * (24 h justas) cuenta como cerrado. `null` o un timestamp inválido → cerrado.
 */
export function isWindowOpen(
  lastInboundAtIso: string | null,
  nowMs: number,
): boolean {
  if (!lastInboundAtIso) return false;
  const t = Date.parse(lastInboundAtIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t < WINDOW_MS;
}

/**
 * `created_at` (ISO) del último mensaje del cliente (`role: 'user'`) de la
 * conversación, o `null` si no hay ninguno. Es lo que reabre la ventana.
 * Robusto ante mensajes desordenados: compara por timestamp, no por posición.
 */
export function lastInboundAt(
  messages: ReadonlyArray<{ role: string; created_at: string }>,
): string | null {
  let latestIso: string | null = null;
  let latestMs = -Infinity;
  for (const m of messages) {
    if (m.role !== "user") continue;
    const ms = Date.parse(m.created_at);
    if (Number.isNaN(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = m.created_at;
    }
  }
  return latestIso;
}
