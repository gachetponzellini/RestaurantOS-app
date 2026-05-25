/**
 * Metadata de las tools del chatbot. Sin dependencias del server (sin
 * "server-only") para que la UI del dashboard pueda importarla directamente.
 *
 * La implementación de cada tool (los builders de LangChain) vive en
 * `src/lib/chatbot/agent.ts` y usa el `name` de acá como clave.
 */

export type ToolGroup = "info" | "cart" | "checkout" | "reservations";

export type ToolMetadata = {
  name: string;
  group: ToolGroup;
  label: string;
  description: string;
  /** Markdown que se inyecta en el system prompt cuando la tool está habilitada. */
  promptSection: string;
  /** Otras tools que deben estar habilitadas para que esta tenga sentido. */
  dependsOn?: string[];
};

export const TOOL_GROUPS: Record<ToolGroup, { label: string; description: string }> = {
  info: {
    label: "Información",
    description:
      "Herramientas para que el bot consulte el catálogo, horarios y datos del negocio.",
  },
  cart: {
    label: "Carrito",
    description:
      "Permiten al bot armar el carrito del cliente durante la conversación.",
  },
  checkout: {
    label: "Checkout",
    description:
      "Cierran el flujo generando el link al checkout web.",
  },
  reservations: {
    label: "Reservas",
    description:
      "Permiten al bot consultar disponibilidad, generar un link para reservar mesa, listar las reservas del cliente y confirmarlas.",
  },
};

export const TOOL_METADATA: ToolMetadata[] = [
  {
    name: "search_products",
    group: "info",
    label: "Buscar productos",
    description:
      "Busca en el catálogo del negocio. Es la base para cualquier flujo que mencione productos.",
    promptSection: `### \`search_products(query)\`
Busca productos activos del catálogo por nombre o descripción.
- **Siempre** antes de mencionar un producto/precio/disponibilidad.
- Usá \`price_ars\` tal cual — no recalcules.
- Si no trae resultados, probá una variación (singular/plural, sinónimo, sin acentos).
- **Cada producto viene con un \`id\` (UUID).** Guardalo mentalmente — lo necesitás para \`get_product_details\` y \`add_to_cart\`. **Nunca inventes un \`id\`**; si no lo tenés, volvé a buscar con \`search_products\`.`,
  },
  {
    name: "get_product_details",
    group: "info",
    label: "Detalles de producto",
    description:
      "Trae el producto con sus grupos de opciones (toppings, tamaños, etc). Requisito para productos con modifiers.",
    dependsOn: ["search_products"],
    promptSection: `### \`get_product_details(product_id)\`
Devuelve el producto con sus \`modifier_groups\` (toppings, tamaños, etc.). Cada grupo tiene \`min_selection\`, \`max_selection\`, \`is_required\`.
- Usala **antes** de \`add_to_cart\` cuando el producto pueda tener opciones.
- Si hay grupos con \`is_required: true\` o \`min_selection > 0\`, preguntale al cliente qué elige antes de agregar.
- Respetá los \`max_selection\` — si el cliente pide más opciones de las permitidas, avisale.`,
  },
  {
    name: "check_business_status",
    group: "info",
    label: "Estado del local (abierto/cerrado)",
    description:
      "Dice si el negocio está abierto, cuándo cierra hoy o cuándo abre la próxima vez.",
    promptSection: `### \`check_business_status()\`
Dice si el local está abierto, cuándo cierra, o cuándo abre.
- Llamala **una sola vez al inicio** de la conversación, como parte del primer mensaje (ver "Primer mensaje").
- Después, volvela a llamar **solo si** el cliente pregunta explícitamente por horarios o si pueden pedir ahora. No la uses como chequeo de rutina.
- Nunca inventes horarios.`,
  },
  {
    name: "get_delivery_info",
    group: "info",
    label: "Info de envío",
    description:
      "Costo de envío, mínimo de pedido, tiempo estimado, dirección del local.",
    promptSection: `### \`get_delivery_info()\`
Delivery fee, mínimo de pedido, minutos estimados, dirección del local (para pickup).
- Usala si preguntan por costo de envío, hasta dónde llevan, mínimo, o dirección para retirar.`,
  },
  {
    name: "get_cart",
    group: "cart",
    label: "Ver carrito",
    description:
      "Muestra el estado del carrito con subtotal y si alcanza el mínimo de delivery.",
    promptSection: `### \`get_cart()\`
Muestra el carrito actual con subtotal y si alcanza el mínimo.
- Llamala antes de \`generate_checkout_link\` **siempre**.
- Llamala cuando el cliente pregunte "qué llevo" / "cuánto va" / "¿cuánto es?".`,
  },
  {
    name: "add_to_cart",
    group: "cart",
    label: "Agregar al carrito",
    description:
      "Agrega un producto al carrito. Valida modifiers contra el producto.",
    dependsOn: ["search_products", "get_product_details"],
    promptSection: `### \`add_to_cart(product_id, quantity, modifier_ids?, notes?)\`
Agrega un ítem al carrito. El server valida producto, modifiers y cantidades.
- Nunca inventes modifier_ids — usá los que te dio \`get_product_details\` o \`add_to_cart\` (cuando devuelve \`needs_options\`).
- Si devuelve \`{ "needs_options": true, groups: [...] }\`: **NO es un error para el cliente**. Usá la info de \`groups\` para preguntarle qué prefiere (una pregunta corta por grupo, con las opciones disponibles). Después volvé a llamar \`add_to_cart\` con los \`modifier_ids\` elegidos. **Nunca le digas al cliente "hubo un error" ni "no se pudo agregar"** — es solo que faltan opciones.
- Si devuelve \`{ "error": ... }\` de verdad (ej. producto no disponible): decilo con empatía y ofrecé alternativas.`,
  },
  {
    name: "remove_from_cart",
    group: "cart",
    label: "Quitar del carrito",
    description: "Remueve una línea del carrito por su id.",
    dependsOn: ["get_cart"],
    promptSection: `### \`remove_from_cart(line_id)\`
Quita una línea del carrito. Usá el \`id\` que viene en \`get_cart\`/\`add_to_cart\`.`,
  },
  {
    name: "generate_checkout_link",
    group: "checkout",
    label: "Generar link de checkout",
    description:
      "Cierra el flujo: guarda el carrito con un token y devuelve la URL para terminar en la web.",
    dependsOn: ["get_cart", "add_to_cart"],
    promptSection: `### \`generate_checkout_link()\`
Genera el link para terminar el pedido en la web. Solo llamala cuando:
1. El cliente confirmó que no quiere agregar más.
2. Llamaste \`get_cart\` en el mensaje previo.
3. El carrito no está vacío.`,
  },
  {
    name: "get_reservation_info",
    group: "reservations",
    label: "Info de reservas",
    description:
      "Política del negocio para reservas: máximo de comensales, anticipación, duración, días abiertos.",
    promptSection: `### \`get_reservation_info()\`
Devuelve la política de reservas del negocio: \`max_party_size\`, \`advance_days_max\`, \`lead_time_min\`, \`slot_duration_min\`, lista de días abiertos con cantidad de turnos.
- Usala si el cliente pregunta "¿hasta cuántas personas?" / "¿con cuánta antelación?" / "¿qué días hay turnos?".
- Si \`accepts_reservations\` es false, el negocio no tiene horarios cargados — avisale al cliente que por ahora no se aceptan reservas.
- Nunca inventes estos datos.`,
  },
  {
    name: "list_reservation_salones",
    group: "reservations",
    label: "Listar salones reservables",
    description:
      "Lista los salones del negocio que aceptan reservas. Si hay más de uno, el cliente tiene que elegir.",
    promptSection: `### \`list_reservation_salones()\`
Devuelve \`{ salones: [{id, name}], multi_salon: boolean }\`.
- Llamala una sola vez al iniciar un flujo de reserva, antes de \`check_reservation_availability\`.
- Si \`multi_salon\` es **false** (0 o 1 salón), ignorá el campo \`floor_plan_id\` en las tools siguientes — el bot no tiene que preguntar nada al cliente.
- Si \`multi_salon\` es **true**, mostrale al cliente los \`name\` (sin el \`id\`) y preguntale en cuál quiere reservar. Una vez que elija, **siempre** pasá el \`id\` correspondiente como \`floor_plan_id\` en \`check_reservation_availability\` y en \`generate_reservation_link\`. Tiene que ser el mismo \`floor_plan_id\` en las dos llamadas.
- Nunca inventes nombres de salones — si la lista está vacía o el cliente menciona uno que no aparece, decilo y ofrecé los que hay.`,
  },
  {
    name: "check_reservation_availability",
    group: "reservations",
    label: "Disponibilidad de reserva",
    description:
      "Lista los horarios disponibles para reservar en una fecha y cantidad de personas.",
    promptSection: `### \`check_reservation_availability(date, party_size, floor_plan_id?)\`
Devuelve los slots (horarios HH:MM) disponibles para reservar en una fecha (YYYY-MM-DD) y cantidad de personas.
- \`date\`: formato \`YYYY-MM-DD\` en hora local del negocio.
- \`party_size\`: entero ≥ 1. Si supera el máximo, devuelve \`error: "party_size_too_large"\` con \`max_party_size\` — pasale ese dato al cliente.
- \`floor_plan_id\` (opcional): si \`list_reservation_salones\` devolvió \`multi_salon: true\`, **siempre** pasá el id del salón que eligió el cliente. Si \`multi_salon\` es false, omitilo.
- **Siempre** llamala antes de \`generate_reservation_link\`. Nunca generes un link con un slot que no apareció en esta lista.
- Mostrale al cliente los slots tal cual te los pasa la tool, sin reformatear los horarios.

**Cuando \`count: 0\` la tool devuelve un \`diagnostic\` — usalo para explicar al cliente por qué no hay**:
- \`"no_schedule_configured"\` → el negocio no cargó horarios de reserva. Decí algo como *"Por ahora no estamos tomando reservas online, ¿te conviene venir directamente?"*. **No insistas** pidiendo otra fecha.
- \`"day_closed"\` → ese día está cerrado. Sugerí otro día mirando el array \`open_days_of_week\` (0=dom, 1=lun, …, 6=sáb).
- \`"no_tables_fit_party"\` → todas las mesas son chicas. Si \`max_seats_available\` es 0 → no hay mesas cargadas en el plano; decile al cliente que llame. Si es >0 → sugerí reservar para esa cantidad o dividir.
- \`"lead_time_or_past"\` → todos los turnos del día ya pasaron o están dentro de \`lead_time_min\`. Sugerí el día siguiente.
- \`"fully_booked"\` → hay turnos abiertos pero están todos llenos. Sugerí otra fecha o party_size distinto.`,
  },
  {
    name: "generate_reservation_link",
    group: "reservations",
    label: "Generar link de reserva",
    description:
      "Guarda los datos elegidos y devuelve un link para que el cliente confirme la reserva logueado en la web.",
    dependsOn: ["check_reservation_availability"],
    promptSection: `### \`generate_reservation_link({ date, slot, party_size, customer_name?, notes?, floor_plan_id? })\`
Crea una "intención de reserva" y devuelve la URL donde el cliente la confirma en la web (después de loguearse).
- **Pre-requisito duro**: tenés que haber llamado \`check_reservation_availability\` y haber tenido confirmación explícita del cliente sobre **fecha + hora + cantidad**. Nunca lo llames sin esa terna confirmada.
- Si \`list_reservation_salones\` devolvió \`multi_salon: true\`, pasá el mismo \`floor_plan_id\` que usaste en \`check_reservation_availability\`. Tienen que coincidir.
- Si la tool devuelve \`error: "slot_no_longer_available"\` con \`available_slots\`, decile al cliente que ese turno se ocupó y ofrecele los nuevos slots.
- Si \`customer_name\` ya lo mencionó el cliente en la conversación, pasalo. Si no, omitilo — la web lo pide al confirmar.
- Después de tener el link, pasaselo con la frase de cierre: explicá que en el link va a iniciar sesión y confirmar sus datos.`,
  },
  {
    name: "list_my_reservations",
    group: "reservations",
    label: "Listar reservas del cliente",
    description:
      "Devuelve las reservas próximas del cliente actual, identificándolo por su teléfono.",
    promptSection: `### \`list_my_reservations()\`
Devuelve las reservas activas (confirmed o seated) y futuras del cliente actual, identificado por su teléfono.
- Usala si el cliente pregunta "¿qué reservas tengo?" / "¿tengo reserva para hoy?".
- Si devuelve \`{ requires_phone: true }\`, pedile el teléfono al cliente y reintentá con esa data en el siguiente turno (la tool todavía no acepta un teléfono como argumento; mientras tanto, indicale que escriba a \`/${"{"}slug${"}"}/perfil/reservas\` para verlas).
- Si \`count\` es 0, ofrecele reservar.
- No inventes IDs. El \`id\` que devuelve es el que necesitás para \`confirm_reservation\`.`,
  },
  {
    name: "confirm_reservation",
    group: "reservations",
    label: "Confirmar reserva",
    description:
      "Marca una reserva como confirmada por el cliente (para el flujo de '¿confirmás tu reserva?').",
    dependsOn: ["list_my_reservations"],
    promptSection: `### \`confirm_reservation(reservation_id)\`
Marca la reserva como confirmada por el cliente. Esto es para el flujo donde el bot pregunta "¿venís hoy a tu reserva?" y el cliente responde que sí.
- Solo llamala si el cliente respondió afirmativamente (sí, dale, voy, confirmo). Si dudó, no la llames y pedí más claridad.
- El \`reservation_id\` viene de \`list_my_reservations\`. Nunca inventes uno.
- Si devuelve \`error: "reservation_not_found"\` puede ser que el teléfono no coincida; pedile que escriba a \`/${"{"}slug${"}"}/perfil/reservas\`.
- Para **cambiar** o **cancelar** una reserva, derivá siempre al cliente a \`/${"{"}slug${"}"}/perfil/reservas\` — el bot no puede modificarla.`,
  },
];

export type ToolOverrides = Record<string, { promptSection?: string }>;

export function isToolEnabled(
  toolName: string,
  enabledTools: string[] | null | undefined,
): boolean {
  // null/undefined = all tools enabled (backwards compat).
  if (!enabledTools) return true;
  return enabledTools.includes(toolName);
}

/**
 * Returns the markdown section for a given tool, applying the business's
 * override if present. Empty/whitespace overrides fall back to the default.
 */
export function resolveToolPromptSection(
  tool: ToolMetadata,
  overrides?: ToolOverrides | null,
): string {
  const override = overrides?.[tool.name]?.promptSection;
  if (typeof override === "string" && override.trim().length > 0) return override;
  return tool.promptSection;
}

export function buildEnabledToolsMarkdown(
  enabledTools: string[] | null | undefined,
  overrides?: ToolOverrides | null,
): string {
  const sections = TOOL_METADATA.filter((t) =>
    isToolEnabled(t.name, enabledTools),
  ).map((t) => resolveToolPromptSection(t, overrides));
  if (sections.length === 0) {
    return "_(Sin herramientas habilitadas — el bot solo puede usar conocimiento general.)_";
  }
  return sections.join("\n\n");
}

export function buildEnabledToolsList(
  enabledTools: string[] | null | undefined,
): string {
  const names = TOOL_METADATA.filter((t) => isToolEnabled(t.name, enabledTools)).map(
    (t) => `\`${t.name}\``,
  );
  return names.length > 0 ? names.join(", ") : "(ninguna)";
}
