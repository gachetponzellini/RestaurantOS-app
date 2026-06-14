/**
 * Estado de configuración del chatbot, por negocio.
 *
 * El bot está "listo para responder" cuando (1) la API key de Anthropic está
 * presente en el entorno del deploy y (2) el dueño dejó el bot habilitado
 * (`chatbot_configs.chatbot_enabled`). El valor de la key NUNCA se expone ni se
 * loguea — sólo se reporta su presencia como booleano.
 *
 * Esta lógica es pura para testearla sin tocar env ni DB; los callers le pasan
 * `hasApiKey` (resuelto con `isAnthropicKeyConfigured()`) y `enabled` (leído de
 * `chatbot_configs`).
 */

export type ChatbotNotReadyReason = "missing_api_key" | "disabled";

export type ChatbotConfigState =
  | { ready: true; reason: "ok" }
  | { ready: false; reason: ChatbotNotReadyReason };

export function resolveChatbotState(input: {
  hasApiKey: boolean;
  enabled: boolean;
}): ChatbotConfigState {
  // missing_api_key primero: es el bloqueante real (lo que pasó en la demo).
  // "disabled" es una decisión deliberada del dueño y sólo aplica si la key está.
  if (!input.hasApiKey) return { ready: false, reason: "missing_api_key" };
  if (!input.enabled) return { ready: false, reason: "disabled" };
  return { ready: true, reason: "ok" };
}

/**
 * Presencia de la API key de Anthropic en el entorno. Devuelve un booleano —
 * jamás el valor. La key se lee de `ANTHROPIC_API_KEY` (la misma que consume el
 * wrapper de LangChain en agent.ts).
 */
export function isAnthropicKeyConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

export const CHATBOT_NOT_READY_MESSAGES: Record<ChatbotNotReadyReason, string> =
  {
    missing_api_key:
      "Falta configurar la API key de Anthropic para que el chatbot responda.",
    disabled: "El chatbot está desactivado para este negocio.",
  };

/**
 * Error tipado para distinguir "el bot no está configurado" de un fallo
 * genérico del modelo. Las rutas lo mapean a una respuesta legible en vez de un
 * 500 opaco. El mensaje nunca contiene el valor de la key.
 */
export class ChatbotNotConfiguredError extends Error {
  readonly reason: ChatbotNotReadyReason;
  constructor(reason: ChatbotNotReadyReason) {
    super(CHATBOT_NOT_READY_MESSAGES[reason]);
    this.name = "ChatbotNotConfiguredError";
    this.reason = reason;
  }
}
